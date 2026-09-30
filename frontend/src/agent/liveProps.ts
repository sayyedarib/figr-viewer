import { elementName } from "../shared/naming";
import type { LiveProps } from "../shared/protocol";

const TEXT_LIMIT = 120;

export function readLiveProps(el: Element): LiveProps {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    name: elementName(el),
    tag: el.localName,
    id: el.id,
    classes: Array.from(el.classList).join(" "),
    size: `${Math.round(r.width)} × ${Math.round(r.height)}`,
    position: `${Math.round(r.left + window.scrollX)}, ${Math.round(r.top + window.scrollY)}`,
    text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT),
    color: cs.color,
    background: cs.backgroundColor,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
  };
}
