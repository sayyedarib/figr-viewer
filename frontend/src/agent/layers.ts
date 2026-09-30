/**
 * What counts as a layer. The spec defines an element as anything except <html>/<body>;
 * we additionally hide elements that never render a box (script, style, …) because they
 * can't be pointed at and would only add noise to the tree. See README "Decisions".
 */
const NON_VISUAL = new Set(["script", "style", "template", "noscript", "link", "meta", "title", "head", "base"]);

export function isLayer(el: Element): boolean {
  return !NON_VISUAL.has(el.localName);
}

/** An element the user can point at: a layer inside <body>, not <body> itself. */
export function isPickable(el: Element | null): el is Element {
  if (!el || !document.body || el === document.body || el === document.documentElement) return false;
  return isLayer(el) && document.body.contains(el);
}

export function layerChildren(parent: Element): Element[] {
  const out: Element[] = [];
  for (let c = parent.firstElementChild; c; c = c.nextElementSibling) if (isLayer(c)) out.push(c);
  return out;
}

/** Parent in the layer tree; null means the element is top level (a child of <body>). */
export function layerParent(el: Element): Element | null {
  const p = el.parentElement;
  return !p || p === document.body ? null : p;
}

/** Ancestors from the top level down to the direct parent (body excluded). */
export function ancestorsOf(el: Element): Element[] {
  const out: Element[] = [];
  for (let p = layerParent(el); p; p = layerParent(p)) out.push(p);
  return out.reverse();
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.matches("input, textarea, select");
}
