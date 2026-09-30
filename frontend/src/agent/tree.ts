import { elementName } from "../shared/naming";
import { GONE, type ChildList, type NavDirection, type NodeId, type NodeInfo, type SearchHit } from "../shared/protocol";
import { ancestorsOf, isLayer, layerChildren, layerParent } from "./layers";
import type { NodeRegistry } from "./registry";

/**
 * Answers the layers panel's questions about the DOM and remembers which child lists
 * the host has loaded, so it can push updates for exactly those when the page changes.
 */
export class TreeQueries {
  /** Loaded parent → signature of the list last sent. `null` key is <body>. */
  private readonly loaded = new Map<NodeId | null, string>();

  constructor(private readonly registry: NodeRegistry) {}

  children(parentId: NodeId | null): ChildList {
    const list = this.listOf(parentId, parentId === null ? document.body : this.require(parentId));
    this.loaded.set(parentId, signature(list));
    return list;
  }

  path(id: NodeId): { chain: ChildList[] } {
    const el = this.require(id);
    const parents: (NodeId | null)[] = [null, ...this.registry.pathOf(el)];
    return { chain: parents.map((p) => this.children(p)) };
  }

  navigate(id: NodeId, dir: NavDirection): { target: NodeInfo | null } {
    const el = this.require(id);
    const target = this.step(el, dir);
    return { target: target ? this.registry.info(target) : null };
  }

  search(query: string): { hits: SearchHit[]; matches: NodeId[] } {
    const needle = query.trim().toLowerCase();
    if (!needle || !document.body) return { hits: [], matches: [] };
    const matched: Element[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (isLayer(n as Element) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (elementName(n as Element).toLowerCase().includes(needle)) matched.push(n as Element);
    }
    const included = new Set<Element>(matched);
    for (const m of matched) for (const a of ancestorsOf(m)) included.add(a);
    // Document order keeps siblings in page order when the host rebuilds the tree.
    const ordered = [...included].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const hits = ordered.map((el) => {
      const parent = layerParent(el);
      return { ...this.registry.info(el), parentId: parent ? this.registry.idOf(parent) : null };
    });
    return { hits, matches: matched.map((m) => this.registry.idOf(m)) };
  }

  /** Child lists of loaded parents whose contents changed since last sent. */
  changedLists(removed: Set<NodeId>): ChildList[] {
    const out: ChildList[] = [];
    for (const [parentId, sig] of this.loaded) {
      if (parentId !== null && removed.has(parentId)) {
        this.loaded.delete(parentId);
        continue;
      }
      const parent = this.resolve(parentId);
      if (!parent) continue;
      const list = this.listOf(parentId, parent);
      const next = signature(list);
      if (next === sig) continue;
      this.loaded.set(parentId, next);
      out.push(list);
    }
    return out;
  }

  require(id: NodeId): Element {
    const el = this.registry.get(id);
    if (!el) throw new Error(GONE);
    return el;
  }

  private resolve(parentId: NodeId | null): Element | null {
    return parentId === null ? document.body : this.registry.get(parentId);
  }

  private listOf(parentId: NodeId | null, parent: Element): ChildList {
    return { parentId, children: layerChildren(parent).map((c) => this.registry.info(c)) };
  }

  private step(el: Element, dir: NavDirection): Element | null {
    if (dir === "firstChild") return layerChildren(el)[0] ?? null;
    if (dir === "parent") return layerParent(el);
    const siblings = layerChildren(el.parentElement ?? document.body);
    const i = siblings.indexOf(el);
    const delta = dir === "nextSibling" ? 1 : -1;
    return siblings[(i + delta + siblings.length) % siblings.length] ?? null;
  }
}

const signature = (list: ChildList) => list.children.map((c) => `${c.id}:${c.name}:${c.childCount}`).join("|");
