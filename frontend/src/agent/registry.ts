import { elementName } from "../shared/naming";
import type { NodeId, NodeInfo } from "../shared/protocol";
import { ancestorsOf, isPickable, layerChildren, layerParent } from "./layers";

/**
 * Everything we remember about an element so we can find it again after the page
 * throws the node away and renders a replacement.
 */
interface Descriptor {
  tag: string;
  classes: string;
  name: string | null;
  key: string | null;
  htmlId: string | null;
  parentId: NodeId | null;
  depth: number;
  /** Nearest earlier/later sibling with a data-key or id, and our distance to the earlier one. */
  prevAnchor: string | null;
  nextAnchor: string | null;
  offset: number;
  /** Whitespace-collapsed text with digit runs masked, so "2s ago" and "4s ago" still match. */
  text: string;
}

export interface ReconcileResult {
  removed: NodeId[];
  updated: NodeInfo[];
}

const TEXT_SAMPLE = 200;

const anchorOf = (el: Element): string | null => {
  const key = el.getAttribute("data-key");
  if (key) return `k:${key}`;
  return el.id ? `i:${el.id}` : null;
};

const fingerprintText = (el: Element) =>
  (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_SAMPLE).replace(/\d+/g, "#");

const infoSignature = (i: NodeInfo) => `${i.name}\u0000${i.key}\u0000${i.childCount}`;

/**
 * Stable element identity for the host.
 *
 * Invariants:
 *  - An id, once handed out, refers to one logical element for the life of the document.
 *  - When the page replaces a node, the id moves to the replacement only if exactly one
 *    candidate matches; otherwise the id is retired. Ambiguity never becomes a guess.
 *  - The set of ids is closed under "parent": exposing an element exposes its ancestors,
 *    so re-identification can always resolve parents first.
 */
export class NodeRegistry {
  private seq = 0;
  private readonly byId = new Map<NodeId, Element>();
  private readonly ids = new WeakMap<Element, NodeId>();
  private readonly descriptors = new Map<NodeId, Descriptor>();
  private readonly lastInfo = new Map<NodeId, string>();

  get(id: NodeId): Element | null {
    const el = this.byId.get(id);
    return el && el.isConnected ? el : null;
  }

  idOf(el: Element): NodeId {
    const known = this.ids.get(el);
    if (known && this.byId.get(known) === el) return known;
    const parent = layerParent(el);
    const parentId = parent ? this.idOf(parent) : null;
    const id = `n${++this.seq}`;
    this.bind(id, el);
    this.descriptors.set(id, this.describe(el, parentId));
    return id;
  }

  info(el: Element): NodeInfo {
    const info: NodeInfo = {
      id: this.idOf(el),
      name: elementName(el),
      tag: el.localName,
      key: el.getAttribute("data-key"),
      childCount: layerChildren(el).length,
    };
    this.lastInfo.set(info.id, infoSignature(info));
    return info;
  }

  pathOf(el: Element): NodeId[] {
    return ancestorsOf(el).map((a) => this.idOf(a));
  }

  /** Run after the page mutates: re-find replaced nodes, retire vanished ones, report changed info. */
  reconcile(): ReconcileResult {
    const removed: NodeId[] = [];
    const updated: NodeInfo[] = [];
    const claimed = new Set<Element>();
    for (const [id] of this.descriptors) {
      const el = this.byId.get(id);
      if (el && isPickable(el)) claimed.add(el);
    }

    const byDepth = [...this.descriptors.entries()].sort((a, b) => a[1].depth - b[1].depth);
    for (const [id, desc] of byDepth) {
      let el: Element | null | undefined = this.byId.get(id);
      if (!el || !isPickable(el)) {
        el = this.resolve(desc, claimed);
        if (!el) {
          this.retire(id);
          removed.push(id);
          continue;
        }
        claimed.add(el);
        this.bind(id, el);
      }
      const parent = layerParent(el);
      this.descriptors.set(id, this.describe(el, parent ? this.idOf(parent) : null));
      const prev = this.lastInfo.get(id);
      const info = this.info(el);
      if (prev !== undefined && prev !== infoSignature(info)) updated.push(info);
    }
    return { removed, updated };
  }

  private bind(id: NodeId, el: Element) {
    const old = this.byId.get(id);
    if (old && old !== el) this.ids.delete(old);
    this.byId.set(id, el);
    this.ids.set(el, id);
  }

  private retire(id: NodeId) {
    const el = this.byId.get(id);
    if (el) this.ids.delete(el);
    this.byId.delete(id);
    this.descriptors.delete(id);
    this.lastInfo.delete(id);
  }

  private describe(el: Element, parentId: NodeId | null): Descriptor {
    let prevAnchor: string | null = null;
    let offset = 0;
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
      offset++;
      if ((prevAnchor = anchorOf(s))) break;
    }
    if (!prevAnchor) offset = [...(el.parentElement?.children ?? [])].indexOf(el);
    let nextAnchor: string | null = null;
    for (let s = el.nextElementSibling; s && !nextAnchor; s = s.nextElementSibling) nextAnchor = anchorOf(s);

    return {
      tag: el.localName,
      classes: el.getAttribute("class") ?? "",
      name: el.getAttribute("data-name"),
      key: el.getAttribute("data-key"),
      htmlId: el.id || null,
      parentId,
      depth: parentId ? (this.descriptors.get(parentId)?.depth ?? 0) + 1 : 0,
      prevAnchor,
      nextAnchor,
      offset,
      text: fingerprintText(el),
    };
  }

  /** Find the one element that is "the same" as `desc`, or null if none or several qualify. */
  private resolve(desc: Descriptor, claimed: Set<Element>): Element | null {
    const free = (el: Element) => !claimed.has(el) && isPickable(el) && el.localName === desc.tag;

    if (desc.key) {
      const keyed = [...document.querySelectorAll(`[data-key="${CSS.escape(desc.key)}"]`)].filter(free);
      if (keyed.length === 1) return keyed[0];
    }
    if (desc.htmlId) {
      const byHtmlId = document.getElementById(desc.htmlId);
      if (byHtmlId && free(byHtmlId)) return byHtmlId;
    }

    const parent = desc.parentId ? this.get(desc.parentId) : document.body;
    if (!parent) return null;
    let candidates = layerChildren(parent).filter(
      (c) =>
        free(c) &&
        (c.getAttribute("class") ?? "") === desc.classes &&
        c.getAttribute("data-name") === desc.name &&
        c.getAttribute("data-key") === desc.key &&
        (c.id || null) === desc.htmlId,
    );

    // Anchor constraints only apply when the anchor itself survived the re-render.
    let anchored = false;
    const siblings = [...parent.children];
    const anchorPresent = (a: string) => siblings.some((s) => anchorOf(s) === a);
    if (desc.prevAnchor && anchorPresent(desc.prevAnchor)) {
      anchored = true;
      candidates = candidates.filter((c) => this.nearestAnchor(c, "prev") === desc.prevAnchor);
    }
    if (desc.nextAnchor && anchorPresent(desc.nextAnchor)) {
      anchored = true;
      candidates = candidates.filter((c) => this.nearestAnchor(c, "next") === desc.nextAnchor);
    }
    // Without a surviving anchor, structure alone could pick a stranger: require the same content.
    if (!anchored || candidates.length > 1) candidates = candidates.filter((c) => fingerprintText(c) === desc.text);
    if (candidates.length > 1 && anchored) {
      candidates = candidates.filter((c) => this.describe(c, desc.parentId).offset === desc.offset);
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  private nearestAnchor(el: Element, dir: "prev" | "next"): string | null {
    for (let s = dir === "prev" ? el.previousElementSibling : el.nextElementSibling; s; ) {
      const a = anchorOf(s);
      if (a) return a;
      s = dir === "prev" ? s.previousElementSibling : s.nextElementSibling;
    }
    return null;
  }
}
