import { useEffect, useRef, type RefObject } from "react";
import { config } from "../../config";
import { useServices } from "../../ui/AppContext";

const LINE_PX = 16;

/**
 * Empty-board gestures: drag to pan, wheel to pan, Ctrl/Cmd+wheel to zoom at the pointer,
 * click to clear the selection. Wheel over a preview never reaches here (the page scrolls
 * natively); Ctrl/Cmd+wheel over a preview is forwarded by the page's agent.
 */
export function useBoardGestures(ref: RefObject<HTMLElement | null>, onPanningChange: (panning: boolean) => void) {
  const { board, selection } = useServices();
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const local = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // also stops browser page zoom on Ctrl+wheel
      const k = e.deltaMode === 1 ? LINE_PX : 1;
      if (e.ctrlKey || e.metaKey) {
        const p = local(e);
        board.zoomAt(p.x, p.y, e.deltaY * k);
      } else if (e.shiftKey && !e.deltaX) board.pan(-e.deltaY * k, 0);
      else board.pan(-e.deltaX * k, -e.deltaY * k);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest("iframe, button, a, input, [data-no-pan]")) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < config.dragThreshold) return;
      if (!d.moved) onPanningChange(true);
      d.moved = true;
      d.x = e.clientX;
      d.y = e.clientY;
      board.pan(dx, dy);
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (d.moved) onPanningChange(false);
      else selection.clear(); // a click on empty board space
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [ref, board, selection, onPanningChange]);
}
