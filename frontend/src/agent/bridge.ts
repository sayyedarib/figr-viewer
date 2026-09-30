import {
  HELLO,
  PROTOCOL,
  isInit,
  type AgentEvent,
  type AgentToHost,
  type CommandBody,
  type HelloMessage,
  type HostToAgent,
  type Mode,
  type RequestBody,
} from "../shared/protocol";

export interface BridgeHandlers {
  onConnect(mode: Mode): void;
  onRequest(body: RequestBody): unknown;
  onCommand(body: CommandBody): void;
}

const HELLO_RETRY_MS = 1000;
const HELLO_ATTEMPTS = 10;

/**
 * The page side of the channel. Announces itself to the parent frame, accepts exactly
 * one MessagePort from it, and from then on speaks only over that port.
 */
export class Bridge {
  private port: MessagePort | null = null;
  private readonly backlog: AgentEvent[] = [];
  private readonly docId = Math.random().toString(36).slice(2) + Date.now().toString(36);

  constructor(private readonly handlers: BridgeHandlers) {}

  start() {
    if (window.parent === window) return; // opened standalone: stay inert
    window.addEventListener("message", this.onWindowMessage);
    const hello: HelloMessage = { type: HELLO, protocol: PROTOCOL, docId: this.docId };
    let attempts = 0;
    const announce = () => {
      if (this.port || attempts++ >= HELLO_ATTEMPTS) return;
      // The hello carries nothing sensitive; the reply is validated by source.
      window.parent.postMessage(hello, "*");
      setTimeout(announce, HELLO_RETRY_MS);
    };
    announce();
  }

  /** Events emitted before the handshake completes are kept only if they matter later. */
  emit(body: AgentEvent) {
    if (this.port) this.post({ kind: "evt", body });
    else if (body.type === "pageError") this.backlog.push(body);
  }

  private post(msg: AgentToHost) {
    this.port?.postMessage(msg);
  }

  private readonly onWindowMessage = (e: MessageEvent) => {
    if (e.source !== window.parent || !isInit(e.data) || this.port || !e.ports[0]) return;
    this.port = e.ports[0];
    this.port.onmessage = (m) => this.onPortMessage(m.data as HostToAgent);
    this.handlers.onConnect(e.data.mode);
    this.backlog.splice(0).forEach((b) => this.emit(b));
  };

  private onPortMessage(msg: HostToAgent) {
    if (msg.kind === "cmd") {
      this.safely(() => this.handlers.onCommand(msg.body));
      return;
    }
    try {
      this.post({ kind: "res", reqId: msg.reqId, ok: true, result: this.handlers.onRequest(msg.body) });
    } catch (err) {
      this.post({ kind: "res", reqId: msg.reqId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error("[figr-agent]", err);
    }
  }
}
