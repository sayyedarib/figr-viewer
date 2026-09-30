import { GONE, type NavDirection, type NodeId, type NodeInfo } from "../../shared/protocol";
import type { ErrorRegistry } from "../errors/ErrorRegistry";
import { regions } from "../errors/regions";
import { AgentRequestError } from "../services/PreviewConnection";
import type { ConnectionHub } from "../services/ConnectionHub";
import { absorbNode, absorbPath, emptySelection, type AppStore } from "../state/store";
import type { PreviewId } from "../state/types";
import type { LayersController } from "./LayersController";

/** Owns `selection`, `hover` and `activePreviewId`. */
export class SelectionController {
  constructor(
    private readonly store: AppStore,
    private readonly hub: ConnectionHub,
    private readonly errors: ErrorRegistry,
    private readonly layers: LayersController,
  ) {}

  /** A click in a preview in Select mode. `node` null = page background. */
  pick(previewId: PreviewId, node: NodeInfo | null, path: NodeId[], shift: boolean) {
    this.store.setState((d) => {
      d.activePreviewId = previewId;
      const doc = d.docs[previewId];
      if (doc && node) {
        absorbNode(doc, node);
        absorbPath(doc, path, node.id);
      }
    });
    if (!node) return this.clear();
    this.select(previewId, node.id, { toggle: shift });
  }

  /** Select `id`. `toggle` adds/removes within the same preview; otherwise the selection is replaced. */
  select(previewId: PreviewId, id: NodeId, { toggle = false, revealInPage = false } = {}) {
    let added = false;
    this.store.setState((d) => {
      const sel = d.selection;
      if (toggle && sel.previewId === previewId) {
        const i = sel.ids.indexOf(id);
        if (i >= 0) sel.ids.splice(i, 1);
        else sel.ids.push(id);
        added = i < 0;
      } else {
        d.selection = { previewId, ids: [id], lost: false };
        added = true;
      }
      d.selection.lost = false;
      if (!d.selection.ids.length) d.selection.previewId = null;
    });
    if (!added) return;
    this.layers.reveal(previewId, id);
    if (revealInPage) this.layers.revealInPage(previewId, id);
  }

  clear() {
    this.store.setState((d) => {
      d.selection = emptySelection();
    });
  }

  hover(previewId: PreviewId, id: NodeId | null, path: NodeId[] = []) {
    this.store.setState((d) => {
      d.hover = id ? { previewId, id, path } : d.hover?.previewId === previewId ? null : d.hover;
    });
  }

  clearHover() {
    this.store.setState((d) => {
      d.hover = null;
    });
  }

  /** The page removed these elements: drop them from hover and selection. */
  dropRemoved(previewId: PreviewId, removed: NodeId[]) {
    const gone = new Set(removed);
    this.store.setState((d) => {
      if (d.hover?.previewId === previewId && gone.has(d.hover.id)) d.hover = null;
      const sel = d.selection;
      if (sel.previewId !== previewId || !sel.ids.some((id) => gone.has(id))) return;
      sel.ids = sel.ids.filter((id) => !gone.has(id));
      if (!sel.ids.length) d.selection = { previewId: null, ids: [], lost: true };
    });
  }

  /** Keyboard steps run one after another, so fast repeats each start from the previous result. */
  private navChain: Promise<unknown> = Promise.resolve();

  /** Enter / Shift+Enter / Tab / Shift+Tab: act on the most recent selection, replace with the result. */
  navigate(dir: NavDirection): boolean {
    if (!this.store.getState().selection.ids.length) return false;
    this.navChain = this.navChain.then(() => this.step(dir));
    return true;
  }

  private step(dir: NavDirection): Promise<unknown> {
    const { selection } = this.store.getState();
    const previewId = selection.previewId;
    const id = selection.ids[selection.ids.length - 1];
    const conn = this.hub.get(previewId);
    if (!previewId || !id || !conn) return Promise.resolve();
    const work = conn.request<"navigate">({ type: "navigate", id, dir }).then(({ target }) => {
      if (!target || !this.stillSelected(previewId, id)) return;
      this.store.setState((d) => {
        const doc = d.docs[previewId];
        if (doc) absorbNode(doc, target);
      });
      this.select(previewId, target.id);
    });
    return this.errors.track(regions.preview(previewId), work.catch(ignoreGone));
  }

  private stillSelected(previewId: PreviewId, id: NodeId) {
    const sel = this.store.getState().selection;
    return sel.previewId === previewId && sel.ids[sel.ids.length - 1] === id;
  }
}

/** A request about an element the page has since removed is "moved on", not a failure. */
export function ignoreGone(err: unknown): undefined {
  if (err instanceof AgentRequestError && err.message === GONE) return undefined;
  throw err;
}
