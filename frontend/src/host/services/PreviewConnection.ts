import {
  INIT,
  type AgentEvent,
  type AgentToHost,
  type CommandBody,
  type HelloMessage,
  type HostToAgent,
  type InitMessage,
  type Mode,
  type RequestMap,
  type RequestType,
  type ResponseOf,
} from "../../shared/protocol";
import { config } from "../config";
import { CancelledError, TimeoutError } from "../errors/errors";
import type { Faults } from "./faults";

export interface ConnectionListener {
  /** A document's agent connected. `navigated` is true when it replaced an earlier document. */
  onDocument(docId: string, navigated: boolean): void;
  onEvent(event: AgentEvent): void;
  /** The page never answered or stopped answering. */
  onUnreachable(error: Error): void;
}

interface Pending {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export const UNREACHABLE_MESSAGE = "Couldn't connect to this preview";

export class AgentRequestError extends Error {
  override name = "AgentRequestError";
}

/**
 * One preview's link to its page. Owns the per-document MessagePort, request/response
 * correlation with timeouts, and liveness (connect timeout + heartbeat).
 *
 * Slow → requests time out individually; the caller's region decides what that means.
 * Gone → no hello within connectMs, or pings unanswered for heartbeatDeadMs → onUnreachable.
 * Replaced (navigation) → the old port is closed and its pending requests are *cancelled*,
 *   which callers treat as "user moved on", not as a failure.
 */
export class PreviewConnection {
  private port: MessagePort | null = null;
  private docId: string | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private pinging = false;
  private disposed = false;

  constructor(
    readonly previewId: string,
    readonly frame: HTMLIFrameElement,
    readonly origin: string,
    private readonly listener: ConnectionListener,
    private readonly getMode: () => Mode,
    private readonly faults: Faults,
    private readonly onTimerError: (err: unknown) => void,
  ) {
    this.connectTimer = setTimeout(() => this.unreachable(), config.timeouts.connectMs);
  }

  get connected() {
    return this.port !== null;
  }

  /** Called by the hub for a hello that came from this preview's frame. */
  accept(hello: HelloMessage) {
    if (this.disposed || this.faults.mutedPreviews.has(this.previewId) || hello.docId === this.docId) return;
    const navigated = this.docId !== null;
    this.closePort("Page replaced");
    clearTimeout(this.connectTimer);

    const channel = new MessageChannel();
    this.port = channel.port1;
    this.docId = hello.docId;
    this.port.onmessage = (e) => this.onMessage(e.data as AgentToHost);
    const init: InitMessage = { type: INIT, mode: this.getMode() };
    this.frame.contentWindow?.postMessage(init, this.origin, [channel.port2]);

    this.startHeartbeat();
    this.listener.onDocument(hello.docId, navigated);
  }

  request<T extends RequestType>(body: RequestMap[T]["req"], timeoutMs: number = config.timeouts.requestMs): Promise<ResponseOf<T>> {
    return new Promise((resolve, reject) => {
      if (!this.port) return reject(new CancelledError("Preview not connected"));
      const reqId = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new TimeoutError(`Page did not answer "${body.type}" within ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.post({ kind: "req", reqId, body });
    });
  }

  /** A request that is registered (and can time out) but never reaches the page. Dev fault only. */
  requestBlackholed<T extends RequestType>(timeoutMs: number): Promise<ResponseOf<T>> {
    return new Promise((_resolve, reject) => {
      const reqId = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new TimeoutError(`Page did not answer within ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(reqId, { resolve: () => {}, reject, timer });
    });
  }

  command(body: CommandBody) {
    this.post({ kind: "cmd", body });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.connectTimer);
    clearInterval(this.heartbeat);
    this.closePort("Preview removed");
  }

  private post(msg: HostToAgent) {
    this.port?.postMessage(msg);
  }

  private onMessage(msg: AgentToHost) {
    if (this.faults.mutedPreviews.has(this.previewId)) return;
    if (msg.kind === "evt") return this.listener.onEvent(msg.body);
    const p = this.pending.get(msg.reqId);
    if (!p) return; // timed out or cancelled earlier: late answers change nothing
    this.pending.delete(msg.reqId);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new AgentRequestError(msg.error));
  }

  private closePort(reason: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new CancelledError(reason));
    }
    this.pending.clear();
    this.port?.close();
    this.port = null;
    this.pinging = false;
  }

  private startHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      try {
        this.faults.trip("heartbeat-timer");
        this.ping();
      } catch (err) {
        this.onTimerError(err);
      }
    }, config.timeouts.heartbeatEveryMs);
  }

  private ping() {
    // Hidden tabs throttle our timers, not the page's message handling, so pings stay honest;
    // we just don't start new ones while nobody is looking.
    if (this.pinging || document.hidden || !this.port) return;
    this.pinging = true;
    this.request<"ping">({ type: "ping" }, config.timeouts.heartbeatDeadMs).then(
      () => (this.pinging = false),
      (err) => {
        this.pinging = false;
        if (err instanceof TimeoutError) this.unreachable();
      },
    );
  }

  private unreachable() {
    if (this.disposed) return;
    clearInterval(this.heartbeat);
    this.faults.mutedPreviews.delete(this.previewId); // an injected outage lasts one attempt
    this.listener.onUnreachable(new Error(UNREACHABLE_MESSAGE));
  }
}
