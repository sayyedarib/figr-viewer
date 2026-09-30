/**
 * Scrolls only this page (never an ancestor frame) until `el` is in view.
 * `Element.scrollIntoView` may propagate to the host document, so we walk the
 * scroll containers ourselves and nudge each by the minimum amount.
 */
const MARGIN = 16;

function nudge(container: Element, el: Element, view: { top: number; bottom: number; left: number; right: number }): boolean {
  const r = el.getBoundingClientRect();
  const before = [container.scrollTop, container.scrollLeft];
  if (r.top < view.top) container.scrollTop -= view.top - r.top + MARGIN;
  else if (r.bottom > view.bottom) container.scrollTop += Math.min(r.bottom - view.bottom + MARGIN, r.top - view.top - MARGIN);
  if (r.left < view.left) container.scrollLeft -= view.left - r.left + MARGIN;
  else if (r.right > view.right) container.scrollLeft += Math.min(r.right - view.right + MARGIN, r.left - view.left - MARGIN);
  return before[0] !== container.scrollTop || before[1] !== container.scrollLeft;
}

function isScrollContainer(el: Element): boolean {
  const cs = getComputedStyle(el);
  const scrollsY = /(auto|scroll|hidden)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight;
  const scrollsX = /(auto|scroll|hidden)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth;
  return scrollsY || scrollsX;
}

export function revealInPage(el: Element): boolean {
  let scrolled = false;
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (!isScrollContainer(p)) continue;
    const r = p.getBoundingClientRect();
    const top = r.top + p.clientTop;
    const left = r.left + p.clientLeft;
    scrolled = nudge(p, el, { top, left, bottom: top + p.clientHeight, right: left + p.clientWidth }) || scrolled;
  }
  const root = document.scrollingElement ?? document.documentElement;
  const view = { top: 0, left: 0, bottom: document.documentElement.clientHeight, right: document.documentElement.clientWidth };
  return nudge(root, el, view) || scrolled;
}
