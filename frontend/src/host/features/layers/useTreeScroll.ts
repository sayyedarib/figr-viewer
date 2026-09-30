import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { config } from "../../config";
import type { Row } from "../../state/rows";
import type { LayersView } from "../../state/types";

const ROW = config.layers.rowHeight;

/**
 * Scroll behaviour for the virtualized tree:
 *  - restores the remembered scroll position when the active preview changes or the
 *    panel switches between tree and search results;
 *  - keeps the rows the user is looking at still when rows are inserted/removed above
 *    them (fixed row height makes this exact arithmetic, no DOM measuring);
 *  - scrolls a revealed row into view.
 * Returns the index window to render.
 */
export function useTreeScroll(
  ref: RefObject<HTMLDivElement | null>,
  previewId: string | null,
  rows: Row[],
  view: LayersView | undefined,
  onScrollSaved: (top: number) => void,
) {
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(400);
  const prev = useRef<{ context: string | null; ids: string[] }>({ context: null, ids: [] });
  const context = previewId === null ? null : `${previewId}:${view?.search ? "search" : "tree"}`;
  const lastTarget = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ids = rows.map((r) => r.id);
    if (prev.current.context !== context) {
      el.scrollTop = view?.scrollTop ?? 0; // switching preview or tree/search: restore exactly
    } else {
      const anchor = findAnchor(prev.current.ids, ids, el.scrollTop);
      if (anchor) el.scrollTop += (anchor.newIndex - anchor.oldIndex) * ROW;
    }
    prev.current = { context, ids };

    const target = view?.scrollTarget;
    if (target && target.nonce !== lastTarget.current) {
      lastTarget.current = target.nonce;
      const i = ids.indexOf(target.id);
      if (i >= 0 && (i * ROW < el.scrollTop || (i + 1) * ROW > el.scrollTop + el.clientHeight)) {
        el.scrollTop = Math.max(0, i * ROW - el.clientHeight / 2);
      }
    }
    setTop(el.scrollTop);
  }, [ref, context, rows, view?.scrollTarget, view?.scrollTop]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setTop(el.scrollTop);
    onScrollSaved(el.scrollTop);
  };

  const { overscan } = config.layers;
  const first = Math.max(0, Math.floor(top / ROW) - overscan);
  const last = Math.min(rows.length, Math.ceil((top + height) / ROW) + overscan);
  return { first, last, onScroll, totalHeight: rows.length * ROW };
}

/** First row at/after the old scroll offset that still exists, with its old and new index. */
function findAnchor(oldIds: string[], newIds: string[], scrollTop: number) {
  const start = Math.floor(scrollTop / ROW);
  if (oldIds[start] === newIds[start]) return null;
  const newIndex = new Map(newIds.map((id, i) => [id, i]));
  for (let i = start; i < oldIds.length; i++) {
    const n = newIndex.get(oldIds[i]);
    if (n !== undefined) return { oldIndex: i, newIndex: n };
  }
  return null;
}
