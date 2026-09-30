import type { AgentEvent } from "../../shared/protocol";
import type { ErrorRegistry } from "../errors/ErrorRegistry";
import { regions } from "../errors/regions";
import type { ConnectionHub } from "../services/ConnectionHub";
import type { Faults } from "../services/faults";
import { PreviewConnection } from "../services/PreviewConnection";
import { absorbNode, emptyDoc, resetPreviewScoped, type AppStore } from "../state/store";
import type { PreviewId } from "../state/types";
import { previewOrigin } from "../state/viewport";
import type { BoardController } from "./BoardController";
import type { LayersController } from "./LayersController";
import type { SelectionController } from "./SelectionController";
import type { ShortcutController } from "./ShortcutController";

/**
 * Connects each preview frame and turns what its page says into state changes.
 * Every handler runs inside the preview's region, so a throw anywhere in here is
 * that preview's failure and nobody else's.
 */
export class PreviewController {
  constructor(
    private readonly store: AppStore,
    private readonly hub: ConnectionHub,
    private readonly errors: ErrorRegistry,
    private readonly faults: Faults,
    private readonly board: BoardController,
    private readonly selection: SelectionController,
    private readonly layers: LayersController,
    private readonly shortcuts: ShortcutController,
    /** Pushes current watch/inspect/mode to a freshly connected page. */
    private readonly onConnected: (previewId: PreviewId) => void,
  ) {}

  /** Called when a preview's iframe mounts. Returns the unmount cleanup. */
  attach(previewId: PreviewId, frame: HTMLIFrameElement, url: string): () => void {
    const region = regions.preview(previewId);
    const conn = new PreviewConnection(
      previewId,
      frame,
      new URL(url).origin,
      {
        onDocument: this.errors.guard(region, (docId: string, navigated: boolean) => this.onDocument(previewId, docId, navigated)),
        onEvent: this.errors.guard(region, (evt: AgentEvent) => {
          this.faults.trip("preview-message");
          this.handle(previewId, evt);
        }),
        onUnreachable: (err) => {
          this.setConnected(previewId, false);
          this.errors.fail(region, err);
        },
      },
      () => this.store.getState().mode,
      this.faults,
      (err) => this.errors.fail(region, err),
    );
    this.hub.add(conn);
    return () => {
      this.hub.remove(conn);
      this.setConnected(previewId, false);
    };
  }

  retry(previewId: PreviewId) {
    this.errors.reset(regions.preview(previewId).id);
    this.store.setState((d) => {
      resetPreviewScoped(d, previewId);
      const p = d.previews[previewId];
      if (p) {
        p.mount += 1;
        p.pageErrors = [];
      }
    });
  }

  private onDocument(previewId: PreviewId, docId: string, navigated: boolean) {
    // A new document means every id we held is meaningless: selection, tree and
    // remembered panel state for this preview start over (R3.8, R4.9).
    this.errors.resetWhere((id) => id.startsWith(`layers-row:${previewId}:`), Object.keys(this.store.getState().failures));
    this.store.setState((d) => {
      if (navigated) resetPreviewScoped(d, previewId);
      d.docs[previewId] = emptyDoc(docId);
      const p = d.previews[previewId];
      if (p) {
        p.connected = true;
        if (navigated) p.pageErrors = [];
      }
    });
    this.onConnected(previewId);
    if (this.store.getState().activePreviewId === previewId) this.layers.ensureRoot(previewId);
  }

  private handle(previewId: PreviewId, evt: AgentEvent) {
    const state = this.store.getState();
    switch (evt.type) {
      case "hover":
        if (state.mode !== "select") return;
        if (evt.node) this.absorb(previewId, evt.node);
        return this.selection.hover(previewId, evt.node?.id ?? null, evt.path);
      case "pointerLeave":
        return this.selection.hover(previewId, null);
      case "pick":
        if (state.mode !== "select") return; // a click raced the mode switch; the page owns it now
        return this.selection.pick(previewId, evt.node, evt.path, evt.shift);
      case "key":
        return void this.shortcuts.handle(evt.input);
      case "zoom": {
        const index = state.board.screens.findIndex((s) => s.id === previewId);
        const origin = previewOrigin(index);
        const { x, y, scale } = state.viewport;
        return this.board.zoomAt(x + (origin.x + evt.clientX) * scale, y + (origin.y + evt.clientY) * scale, evt.deltaY);
      }
      case "boxes":
        return this.store.setState((d) => {
          const doc = d.docs[previewId];
          if (doc) Object.assign(doc.boxes, evt.boxes);
        });
      case "live":
        return this.store.setState((d) => {
          const doc = d.docs[previewId];
          if (doc) Object.assign(doc.live, evt.props);
        });
      case "dom":
        this.layers.applyDom(previewId, evt);
        return this.selection.dropRemoved(previewId, evt.removed);
      case "pageError":
        this.store.setState((d) => {
          d.previews[previewId]?.pageErrors.push(evt.message);
        });
        return this.errors.note(regions.preview(previewId), new Error(evt.message));
    }
  }

  private absorb(previewId: PreviewId, node: Parameters<typeof absorbNode>[1]) {
    this.store.setState((d) => {
      const doc = d.docs[previewId];
      if (doc) absorbNode(doc, node);
    });
  }

  private setConnected(previewId: PreviewId, connected: boolean) {
    this.store.setState((d) => {
      const p = d.previews[previewId];
      if (p) p.connected = connected;
    });
  }
}
