import { immer } from "zustand/middleware/immer";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { ChildList, NodeInfo, SearchHit } from "../../shared/protocol";
import { config } from "../config";
import type { Screen } from "../services/api";
import { parentKey, type AppState, type DocState, type LayersView, type PreviewId } from "./types";

export type AppStore = StoreApi<AppState> & { setState: ImmerSet };
type ImmerSet = (recipe: (draft: AppState) => void) => void;

export const emptySelection = () => ({ previewId: null, ids: [], lost: false });

export const initialState = (): AppState => ({
  mode: "select",
  viewport: { x: config.grid.margin, y: config.grid.margin, scale: config.zoom.initial },
  board: { status: "loading", screens: [], epoch: 0 },
  previews: {},
  docs: {},
  layers: {},
  activePreviewId: null,
  hover: null,
  selection: emptySelection(),
  failures: {},
});

export function createAppStore(): AppStore {
  return createStore<AppState>()(immer(() => initialState())) as AppStore;
}

export const emptyDoc = (docId: string): DocState => ({ docId, nodes: {}, parentOf: {}, lists: {}, boxes: {}, live: {} });
export const emptyLayers = (): LayersView => ({ expanded: {}, scrollTop: 0, treeScrollTop: 0, query: "", search: null, scrollTarget: null });

// ---------------------------------------------------------------- draft helpers (pure, reused by actions)

/** Records node infos and parent links from a child list. */
export function absorbList(doc: DocState, list: ChildList) {
  const key = parentKey(list.parentId);
  const ids = list.children.map((c) => c.id);
  for (const c of list.children) absorbNode(doc, c, list.parentId);
  doc.lists[key] = { status: "loaded", ids };
}

export function absorbNode(doc: DocState, info: NodeInfo, parentId?: string | null) {
  doc.nodes[info.id] = info;
  if (parentId !== undefined) doc.parentOf[info.id] = parentId;
}

export function absorbHits(doc: DocState, hits: SearchHit[]) {
  for (const { parentId, ...info } of hits) absorbNode(doc, info, parentId);
}

/** Records a path (top-level → parent) as parent links. */
export function absorbPath(doc: DocState, path: string[], leafId: string) {
  const chain = [...path, leafId];
  chain.forEach((id, i) => (doc.parentOf[id] = i === 0 ? null : chain[i - 1]));
}

export function resetPreviewScoped(draft: AppState, previewId: PreviewId) {
  delete draft.docs[previewId];
  delete draft.layers[previewId];
  if (draft.hover?.previewId === previewId) draft.hover = null;
  if (draft.selection.previewId === previewId) draft.selection = emptySelection();
}

export const screensToPreviews = (screens: Screen[]) =>
  Object.fromEntries(screens.map((s) => [s.id, { mount: 0, connected: false, pageErrors: [] }])) as AppState["previews"];
