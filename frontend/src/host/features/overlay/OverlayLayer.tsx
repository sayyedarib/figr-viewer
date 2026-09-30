import { memo } from "react";
import type { NodeId } from "../../../shared/protocol";
import { config } from "../../config";
import { regions } from "../../errors/regions";
import { previewOrigin, toScreen } from "../../state/viewport";
import { useAppShallow, useAppState, useFaultTick, useServices } from "../../ui/AppContext";
import { RegionBoundary } from "../../ui/RegionBoundary";
import { placeLabel, scaleRect } from "./placement";

type Kind = "hover" | "selected";
interface Item {
  id: NodeId;
  kind: Kind;
}

/**
 * Outlines and labels live in screen space, above the scaled board, so borders stay
 * 1px/2px and labels keep their size at any zoom. Each preview's outlines sit in a box
 * the size of that preview with overflow hidden: that's the clip to the preview's edges.
 */
export function OverlayLayer() {
  const mode = useAppState((s) => s.mode);
  const hover = useAppState((s) => s.hover);
  const selection = useAppState((s) => s.selection);
  if (mode !== "select") return null; // Interact mode: selection kept, not drawn

  const byPreview = new Map<string, Item[]>();
  const add = (previewId: string, item: Item) => byPreview.set(previewId, [...(byPreview.get(previewId) ?? []), item]);
  if (selection.previewId) for (const id of selection.ids) add(selection.previewId, { id, kind: "selected" });
  if (hover && !(hover.previewId === selection.previewId && selection.ids.includes(hover.id))) add(hover.previewId, { id: hover.id, kind: "hover" });

  return (
    <div className="overlay" aria-hidden>
      {[...byPreview].map(([previewId, items]) => (
        <OverlayRegion key={previewId} previewId={previewId} items={items} />
      ))}
    </div>
  );
}

function OverlayRegion({ previewId, items }: { previewId: string; items: Item[] }) {
  const { previews } = useServices();
  // Drawing errors are the preview's failure; the preview card shows it.
  return (
    <RegionBoundary region={regions.preview(previewId)} onRetry={() => previews.retry(previewId)} fallback="none">
      <PreviewOverlay previewId={previewId} items={items} />
    </RegionBoundary>
  );
}

const PreviewOverlay = memo(function PreviewOverlay({ previewId, items }: { previewId: string; items: Item[] }) {
  const { faults } = useServices();
  useFaultTick();
  faults.trip("overlay-render");

  const index = useAppState((s) => s.board.screens.findIndex((sc) => sc.id === previewId));
  const viewport = useAppState((s) => s.viewport);
  const ids = items.map((i) => i.id);
  const boxes = useAppShallow((s) => ids.map((id) => s.docs[previewId]?.boxes[id] ?? null));
  const names = useAppShallow((s) => ids.map((id) => s.docs[previewId]?.nodes[id]?.name ?? ""));
  if (index < 0) return null;

  const k = viewport.scale;
  const origin = previewOrigin(index);
  const topLeft = toScreen(viewport, origin.x, origin.y);
  const width = config.preview.width * k;
  const height = config.preview.height * k;

  return (
    <div className="overlay__preview" style={{ left: topLeft.x, top: topLeft.y, width, height }}>
      {items.map((item, i) => {
        const box = boxes[i];
        if (!box?.visible) return null; // scrolled fully out of view: no outline, still selected
        const rect = scaleRect(box.rect, k);
        const visible = scaleRect(box.visible, k);
        const label = placeLabel(rect, height);
        return (
          <div key={`${item.kind}:${item.id}`} className={`outline outline--${item.kind}`}>
            <div className="outline__clip" style={{ left: visible.x, top: visible.y, width: visible.w, height: visible.h }}>
              <div className="outline__box" style={{ left: rect.x - visible.x, top: rect.y - visible.y, width: rect.w, height: rect.h }} />
            </div>
            <div className="outline__label" style={{ left: label.x, top: label.y }}>
              {names[i]}
            </div>
          </div>
        );
      })}
    </div>
  );
});
