import type { AgentEvent, ChildList, NodeId } from "../../shared/protocol";
import { config } from "../config";
import type { ErrorRegistry } from "../errors/ErrorRegistry";
import { regions, type Region } from "../errors/regions";
import { isCancellation } from "../errors/errors";
import type { ConnectionHub } from "../services/ConnectionHub";
import type { Faults } from "../services/faults";
import { visibleRows } from "../state/rows";
import { absorbHits, absorbList, absorbNode, emptyLayers, type AppStore } from "../state/store";
import { parentKey, type AppState, type PreviewId } from "../state/types";
import { ignoreGone } from "./SelectionController";

type DomEvent = Extract<AgentEvent, { type: "dom" }>;

/**
 * Owns the layers tree: child loading, expansion, reveal, search, and applying the
 * page's DOM changes. One request per (document, parent) at a time; results replace
 * the list rather than append, so collapse/re-expand can never duplicate children.
 */
export class LayersController {
  private readonly searchTimers = new Map<PreviewId, ReturnType<typeof setTimeout>>();
  private revealNonce = 0;
  /** Set by the composition root; selection lives in its own controller. */
  selectRow: (previewId: PreviewId, id: NodeId, toggle: boolean) => void = () => {};

  constructor(
    private readonly store: AppStore,
    private readonly hub: ConnectionHub,
    private readonly errors: ErrorRegistry,
    private readonly faults: Faults,
  ) {}

  // ------------------------------------------------------------ loading

  ensureRoot(previewId: PreviewId) {
    this.ensureList(previewId, null);
  }

  toggle(previewId: PreviewId, id: NodeId) {
    const expanded = !!this.view(previewId)?.expanded[id];
    if (expanded) this.collapse(previewId, id);
    else this.expand(previewId, id);
  }

  expand(previewId: PreviewId, id: NodeId) {
    this.updateView(previewId, (v) => (v.expanded[id] = true));
    this.ensureList(previewId, id);
  }

  collapse(previewId: PreviewId, id: NodeId) {
    this.updateView(previewId, (v) => delete v.expanded[id]);
  }

  retry(previewId: PreviewId, parentId: NodeId | null) {
    this.errors.reset(this.listRegion(previewId, parentId).id);
    this.store.setState((d) => {
      delete d.docs[previewId]?.lists[parentKey(parentId)];
    });
    this.ensureList(previewId, parentId);
  }

  /** Load a child list unless it is already loading, loaded or failed. */
  ensureList(previewId: PreviewId, parentId: NodeId | null) {
    const state = this.store.getState();
    const doc = state.docs[previewId];
    const conn = this.hub.get(previewId);
    const key = parentKey(parentId);
    if (!doc || !conn?.connected || doc.lists[key]) return; // loading, loaded or failed: never request twice
    const docId = doc.docId;
    this.store.setState((d) => {
      d.docs[previewId].lists[key] = { status: "loading", ids: [] };
    });

    const region = this.listRegion(previewId, parentId);
    const request = this.faults.take("hangNextChildren")
      ? conn.requestBlackholed<"children">(config.timeouts.childrenMs)
      : conn.request<"children">({ type: "children", parentId }, config.timeouts.childrenMs);

    const onSameDoc = (fn: (d: AppState) => void) =>
      this.store.setState((d) => {
        if (d.docs[previewId]?.docId === docId) fn(d);
      });

    const work = request
      .then((list) => onSameDoc((d) => d.docs[previewId].lists[key]?.status === "loading" && absorbList(d.docs[previewId], list)))
      .catch((err) => {
        // Only the attempt that still owns the "loading" slot may resolve it; if a path
        // reveal or a DOM push already filled the list, this outcome is moot.
        let owned = false;
        onSameDoc((d) => {
          const lists = d.docs[previewId].lists;
          if (lists[key]?.status !== "loading") return;
          owned = true;
          // Cancelled (page replaced) → forget the attempt so the next look asks again.
          if (isCancellation(err)) delete lists[key];
          else lists[key] = { status: "error", ids: [] };
        });
        if (owned) throw err;
      });
    void this.errors.track(region, work.catch(ignoreGone));
  }

  private listRegion(previewId: PreviewId, parentId: NodeId | null): Region {
    if (parentId === null) return regions.layers(previewId);
    const key = this.store.getState().docs[previewId]?.nodes[parentId]?.key;
    return regions.layersRow(previewId, parentId, key);
  }

  // ------------------------------------------------------------ reveal

  /** Selection sync: open every ancestor (loading whole chain in one round trip) and scroll the row into view. */
  reveal(previewId: PreviewId, id: NodeId) {
    const conn = this.hub.get(previewId);
    const view = this.view(previewId);
    if (!conn?.connected) return;
    if (view?.search) return this.requestScroll(previewId, id); // search view already shows ancestors
    const docId = this.store.getState().docs[previewId]?.docId;
    const work = conn.request<"path">({ type: "path", id }).then(({ chain }) => {
      this.store.setState((d) => {
        const doc = d.docs[previewId];
        if (doc?.docId !== docId) return;
        d.layers[previewId] ??= emptyLayers();
        for (const list of chain) {
          absorbList(doc, list);
          if (list.parentId) d.layers[previewId].expanded[list.parentId] = true;
        }
      });
      this.requestScroll(previewId, id);
    });
    void this.errors.track(regions.layers(previewId), work.catch(ignoreGone));
  }

  /** Scroll only that page so the element is visible. */
  revealInPage(previewId: PreviewId, id: NodeId) {
    const conn = this.hub.get(previewId);
    if (!conn?.connected) return;
    void this.errors.track(regions.preview(previewId), conn.request<"reveal">({ type: "reveal", id }).catch(ignoreGone));
  }

  private requestScroll(previewId: PreviewId, id: NodeId) {
    this.updateView(previewId, (v) => (v.scrollTarget = { id, nonce: ++this.revealNonce }));
  }

  // ------------------------------------------------------------ search

  setQuery(previewId: PreviewId, query: string) {
    this.updateView(previewId, (v) => {
      v.query = query;
      if (!query.trim() && v.search) {
        v.search = null;
        v.scrollTop = v.treeScrollTop; // back to the tree exactly where it was
      }
    });
    clearTimeout(this.searchTimers.get(previewId));
    if (query.trim()) this.searchTimers.set(previewId, setTimeout(() => this.runSearch(previewId), config.layers.searchDebounceMs));
  }

  private runSearch(previewId: PreviewId) {
    const conn = this.hub.get(previewId);
    const query = this.view(previewId)?.query ?? "";
    if (!conn?.connected || !query.trim()) return;
    this.updateView(previewId, (v) => {
      if (!v.search) {
        v.treeScrollTop = v.scrollTop;
        v.scrollTop = 0;
      }
      v.search = v.search?.query === query ? v.search : { query, status: "loading", hits: v.search?.hits ?? [], matches: v.search?.matches ?? [] };
    });
    const work = conn.request<"search">({ type: "search", query }).then(({ hits, matches }) => {
      this.store.setState((d) => {
        const view = d.layers[previewId];
        const doc = d.docs[previewId];
        if (!view || !doc || view.query !== query) return; // superseded by newer typing
        absorbHits(doc, hits);
        view.search = { query, status: "ready", hits, matches };
      });
    });
    void this.errors.track(regions.layers(previewId), work);
  }

  // ------------------------------------------------------------ page changes

  applyDom(previewId: PreviewId, evt: DomEvent) {
    const removed = new Set(evt.removed);
    this.store.setState((d) => {
      const doc = d.docs[previewId];
      if (!doc) return;
      for (const info of evt.updated) absorbNode(doc, info);
      for (const list of evt.lists) this.applyList(doc, list);
      for (const id of removed) {
        delete doc.nodes[id];
        delete doc.parentOf[id];
        delete doc.lists[id];
        delete doc.boxes[id];
        delete doc.live[id];
      }
      const view = d.layers[previewId];
      if (view) for (const id of removed) delete view.expanded[id];
    });
    if (removed.size) this.errors.resetWhere((rid) => evt.removed.some((id) => rid === `layers-row:${previewId}:${id}`), Object.keys(this.store.getState().failures));
    if (this.view(previewId)?.search) this.setQuery(previewId, this.view(previewId)!.query);
  }

  private applyList(doc: AppState["docs"][string], list: ChildList) {
    const current = doc.lists[parentKey(list.parentId)];
    if (current?.status === "error") return; // the row shows its failure until retried
    absorbList(doc, list);
  }

  // ------------------------------------------------------------ keyboard (panel focused)

  /** ↑/↓: select previous/next visible row. */
  moveSelection(previewId: PreviewId, delta: 1 | -1) {
    const rows = this.rows(previewId);
    if (!rows.length) return;
    const current = this.focusedIndex(previewId, rows);
    const next = rows[Math.min(rows.length - 1, Math.max(0, current < 0 ? 0 : current + delta))];
    this.selectRow(previewId, next.id, false);
  }

  /** →: expand, or step into the first child if already expanded. */
  expandOrEnter(previewId: PreviewId) {
    const rows = this.rows(previewId);
    const row = rows[this.focusedIndex(previewId, rows)];
    if (!row?.hasChildren) return;
    if (!row.expanded) return this.expand(previewId, row.id);
    const child = rows.find((r) => r.parentId === row.id);
    if (child) this.selectRow(previewId, child.id, false);
  }

  /** ←: collapse, or step out to the parent if already collapsed. */
  collapseOrExit(previewId: PreviewId) {
    const rows = this.rows(previewId);
    const row = rows[this.focusedIndex(previewId, rows)];
    if (!row) return;
    if (row.expanded && !this.view(previewId)?.search) return this.collapse(previewId, row.id);
    if (row.parentId) this.selectRow(previewId, row.parentId, false);
  }

  saveScroll(previewId: PreviewId, top: number) {
    const view = this.view(previewId);
    if (view && view.scrollTop !== top) this.updateView(previewId, (v) => (v.scrollTop = top));
  }

  // ------------------------------------------------------------ helpers

  private rows(previewId: PreviewId) {
    const s = this.store.getState();
    return visibleRows(s.docs[previewId], s.layers[previewId]);
  }

  private focusedIndex(previewId: PreviewId, rows: { id: NodeId }[]) {
    const sel = this.store.getState().selection;
    if (sel.previewId !== previewId) return -1;
    const last = sel.ids[sel.ids.length - 1];
    return rows.findIndex((r) => r.id === last);
  }

  private view(previewId: PreviewId) {
    return this.store.getState().layers[previewId];
  }

  private updateView(previewId: PreviewId, fn: (v: AppState["layers"][string]) => unknown) {
    this.store.setState((d) => {
      fn((d.layers[previewId] ??= emptyLayers()));
    });
  }
}

