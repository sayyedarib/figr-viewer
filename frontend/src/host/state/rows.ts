import type { NodeId } from "../../shared/protocol";
import { ROOT, type DocState, type Hover, type LayersView, type ParentKey } from "./types";

export interface Row {
  id: NodeId;
  parentId: NodeId | null;
  depth: number;
  name: string;
  hasChildren: boolean;
  expanded: boolean;
  /** Child loading state, meaningful only when expanded. */
  status: "idle" | "loading" | "loaded" | "error";
  /** Directly matches the search query (vs. shown as an ancestor). */
  match: boolean;
}

/**
 * Flattens the tree into the rows the panel shows, in order.
 * Normal mode follows the user's expanded set over loaded child lists.
 * Search mode shows matches plus ancestors, all open, and never touches `expanded`,
 * which is why clearing the search restores the previous state exactly.
 */
export function visibleRows(doc: DocState | undefined, view: LayersView | undefined): Row[] {
  if (!doc || !view) return [];
  return view.search ? searchRows(doc, view) : treeRows(doc, view);
}

function treeRows(doc: DocState, view: LayersView): Row[] {
  const rows: Row[] = [];
  const walk = (key: ParentKey, parentId: NodeId | null, depth: number) => {
    const list = doc.lists[key];
    if (list?.status !== "loaded") return;
    for (const id of list.ids) {
      const node = doc.nodes[id];
      if (!node) continue;
      const expanded = !!view.expanded[id] && node.childCount > 0;
      const status = expanded ? (doc.lists[id]?.status ?? "loading") : "idle";
      rows.push({ id, parentId, depth, name: node.name, hasChildren: node.childCount > 0, expanded, status, match: false });
      if (expanded) walk(id, id, depth + 1);
    }
  };
  walk(ROOT, null, 0);
  return rows;
}

function searchRows(doc: DocState, view: LayersView): Row[] {
  const search = view.search!;
  const matches = new Set(search.matches);
  const children = new Map<NodeId | null, NodeId[]>();
  for (const h of search.hits) {
    const list = children.get(h.parentId) ?? [];
    list.push(h.id);
    children.set(h.parentId, list);
  }
  const rows: Row[] = [];
  const walk = (parentId: NodeId | null, depth: number) => {
    for (const id of children.get(parentId) ?? []) {
      const node = doc.nodes[id];
      if (!node) continue;
      const open = children.has(id);
      rows.push({ id, parentId, depth, name: node.name, hasChildren: node.childCount > 0, expanded: open, status: open ? "loaded" : "idle", match: matches.has(id) });
      walk(id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** The row to highlight for a hover: the element's own row, else its nearest visible ancestor. */
export function hoverRowId(rows: Row[], hover: Hover | null): NodeId | null {
  if (!hover) return null;
  const visible = new Set(rows.map((r) => r.id));
  if (visible.has(hover.id)) return hover.id;
  for (let i = hover.path.length - 1; i >= 0; i--) if (visible.has(hover.path[i])) return hover.path[i];
  return null;
}

/** Ancestor ids (top-level first) of a node as far as the host knows them. */
export function knownPath(doc: DocState, id: NodeId): NodeId[] {
  const path: NodeId[] = [];
  for (let p = doc.parentOf[id]; p; p = doc.parentOf[p]) path.unshift(p);
  return path;
}
