import type { AppStore } from "../state/store";
import type { AppState, PreviewId } from "../state/types";
import type { ConnectionHub } from "../services/ConnectionHub";

/**
 * Keeps each page's agent in step with host state: which elements to stream boxes for
 * (outlines), which to stream styles for (inspector), the mode, and hover resets.
 * The only place that derives agent subscriptions from state, so no component has to.
 */
export class SyncController {
  private readonly sent = new Map<PreviewId, { watch: string; inspect: string }>();
  private unsubscribe: () => void = () => {};

  constructor(
    private readonly store: AppStore,
    private readonly hub: ConnectionHub,
  ) {}

  start() {
    this.unsubscribe = this.store.subscribe((s, prev) => {
      if (s.mode !== prev.mode) for (const c of this.hub.all()) c.command({ type: "mode", mode: s.mode });
      // Host-side hover clears (pan, zoom, mode switch) must let that page report hover afresh.
      if (prev.hover && s.hover?.previewId !== prev.hover.previewId) this.hub.get(prev.hover.previewId)?.command({ type: "resetHover" });
      if (s.hover !== prev.hover || s.selection !== prev.selection || s.mode !== prev.mode) {
        for (const c of this.hub.all()) this.push(c.previewId, s);
      }
    });
    return this;
  }

  stop() {
    this.unsubscribe();
  }

  /** Called when a page (re)connects: it knows nothing yet. */
  resync(previewId: PreviewId) {
    this.sent.delete(previewId);
    const conn = this.hub.get(previewId);
    conn?.command({ type: "mode", mode: this.store.getState().mode });
    this.push(previewId, this.store.getState());
  }

  private push(previewId: PreviewId, s: AppState) {
    const conn = this.hub.get(previewId);
    if (!conn?.connected) return;
    const selected = s.selection.previewId === previewId ? s.selection.ids : [];
    const watch = s.mode === "select" ? [...new Set([...selected, ...(s.hover?.previewId === previewId ? [s.hover.id] : [])])] : [];
    const next = { watch: watch.join(","), inspect: selected.join(",") };
    const prev = this.sent.get(previewId);
    if (prev?.watch !== next.watch) conn.command({ type: "watch", ids: watch });
    if (prev?.inspect !== next.inspect) conn.command({ type: "inspect", ids: selected });
    this.sent.set(previewId, next);
  }
}
