import { useEffect } from "react";
import { keyInputFrom } from "../../app/ShortcutController";
import { regions } from "../../errors/regions";
import { useServices } from "../../ui/AppContext";

/** Host-side keys. Keys pressed inside a page arrive through the agent and hit the same controller. */
export function useGlobalShortcuts() {
  const { shortcuts, store, errors, selection } = useServices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A key that fails belongs to whatever it was acting on: the selected preview, else the board.
      const previewId = store.getState().selection.previewId ?? store.getState().activePreviewId;
      const region = previewId ? regions.preview(previewId) : regions.board();
      errors.guard(region, () => {
        if (shortcuts.handle(keyInputFrom(e))) e.preventDefault();
      })();
    };
    const onLeave = (e: MouseEvent) => {
      const out = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight;
      if (out) selection.clearHover();
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [shortcuts, store, errors, selection]);
}
