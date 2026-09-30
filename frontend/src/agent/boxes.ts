import { fromDomRect, intersect } from "../shared/geometry";
import type { ElementBox, Rect } from "../shared/protocol";

/** The part of an element's box that is visible through the viewport and every clipping ancestor. */
function visibleRect(el: Element, rect: Rect): Rect | null {
  const root = document.documentElement;
  let visible: Rect | null = intersect(rect, { x: 0, y: 0, w: root.clientWidth, h: root.clientHeight });

  for (let cur: Element = el; visible; ) {
    if (getComputedStyle(cur).position === "fixed") break; // escapes every ancestor's clip
    const parent = cur.parentElement;
    if (!parent || parent === document.body || parent === root) break;
    const cs = getComputedStyle(parent);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") visible = intersect(visible, clipBox(parent));
    cur = parent;
  }
  return visible;
}

/** Padding box of a clipping element (the area its overflow is cut to). */
function clipBox(el: Element): Rect {
  const r = el.getBoundingClientRect();
  if (!(el instanceof HTMLElement)) return fromDomRect(r);
  return { x: r.left + el.clientLeft, y: r.top + el.clientTop, w: el.clientWidth, h: el.clientHeight };
}

export function measure(el: Element): ElementBox {
  const rect = fromDomRect(el.getBoundingClientRect());
  return { rect, visible: visibleRect(el, rect) };
}
