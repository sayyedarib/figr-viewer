import { isHello } from "../../shared/protocol";
import type { PreviewConnection } from "./PreviewConnection";

/**
 * Routes handshakes to the right preview. The only `window` message listener in the host;
 * a hello is accepted only if it comes from a known preview frame *and* that frame's origin.
 */
export class ConnectionHub {
  private readonly connections = new Map<string, PreviewConnection>();

  constructor(private readonly win: Window = window) {
    win.addEventListener("message", this.onMessage);
  }

  add(conn: PreviewConnection) {
    this.connections.get(conn.previewId)?.dispose();
    this.connections.set(conn.previewId, conn);
  }

  remove(conn: PreviewConnection) {
    if (this.connections.get(conn.previewId) === conn) this.connections.delete(conn.previewId);
    conn.dispose();
  }

  get(previewId: string | null | undefined): PreviewConnection | undefined {
    return previewId ? this.connections.get(previewId) : undefined;
  }

  all(): Iterable<PreviewConnection> {
    return this.connections.values();
  }

  destroy() {
    this.win.removeEventListener("message", this.onMessage);
    for (const c of this.connections.values()) c.dispose();
    this.connections.clear();
  }

  private readonly onMessage = (e: MessageEvent) => {
    if (!isHello(e.data)) return;
    for (const conn of this.connections.values()) {
      if (conn.frame.contentWindow === e.source && conn.origin === e.origin) return conn.accept(e.data);
    }
  };
}
