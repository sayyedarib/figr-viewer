import type { ElementBox, LiveProps, Mode, NodeId, NodeInfo, SearchHit } from "../../shared/protocol";
import type { Screen } from "../services/api";

export type PreviewId = string;

/** Key for a child list: a node id, or ROOT for the children of <body>. */
export type ParentKey = NodeId | typeof ROOT;
export const ROOT = "#root";
export const parentKey = (id: NodeId | null): ParentKey => id ?? ROOT;

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface BoardState {
  status: "loading" | "ready" | "error";
  screens: Screen[];
  /** Bumped on every board (re)load; everything keyed per preview is dropped with it. */
  epoch: number;
}

export interface PreviewState {
  /** Bumped to remount the iframe (Retry). */
  mount: number;
  connected: boolean;
  pageErrors: string[];
}

export interface ChildListState {
  status: "loading" | "loaded" | "error";
  ids: NodeId[];
}

export interface SearchState {
  query: string;
  status: "loading" | "ready";
  hits: SearchHit[];
  matches: NodeId[];
}

/**
 * What we know about the document currently shown in a preview. Replaced wholesale when
 * the page navigates, which is how "selection clears / tree shows the new page" happens.
 */
export interface DocState {
  docId: string;
  nodes: Record<NodeId, NodeInfo>;
  parentOf: Record<NodeId, NodeId | null>;
  lists: Record<ParentKey, ChildListState>;
  boxes: Record<NodeId, ElementBox | null>;
  live: Record<NodeId, LiveProps>;
}

/** Per-preview layers panel view state, remembered while the user looks at other previews. */
export interface LayersView {
  expanded: Record<NodeId, true>;
  scrollTop: number;
  /** Tree scroll position to return to when the search is cleared. */
  treeScrollTop: number;
  query: string;
  search: SearchState | null;
  /** Row the panel should scroll into view next; the nonce makes repeat requests distinct. */
  scrollTarget: { id: NodeId; nonce: number } | null;
}

export interface Hover {
  previewId: PreviewId;
  id: NodeId;
  /** Ancestor ids from top level down to the parent. */
  path: NodeId[];
}

export interface Selection {
  previewId: PreviewId | null;
  /** In selection order; the last one is "most recently selected". */
  ids: NodeId[];
  /** Everything selected was removed by the page ("This element no longer exists"). */
  lost: boolean;
}

export interface AppState {
  mode: Mode;
  viewport: Viewport;
  board: BoardState;
  previews: Record<PreviewId, PreviewState>;
  docs: Record<PreviewId, DocState>;
  layers: Record<PreviewId, LayersView>;
  activePreviewId: PreviewId | null;
  hover: Hover | null;
  selection: Selection;
  failures: Record<string, { message: string }>;
}
