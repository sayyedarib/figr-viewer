import { useRef, useState } from "react";
import { regions } from "../../errors/regions";
import { useAppState, useServices } from "../../ui/AppContext";
import { RegionBoundary } from "../../ui/RegionBoundary";
import { OverlayLayer } from "../overlay/OverlayLayer";
import { PreviewCard } from "./PreviewCard";
import { useBoardGestures } from "./useBoardGestures";

export function Board() {
  const { board } = useServices();
  return (
    <RegionBoundary region={regions.board()} onRetry={() => board.load()} title="Couldn't load the board">
      <BoardViewport />
    </RegionBoundary>
  );
}

function BoardViewport() {
  const ref = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  useBoardGestures(ref, setPanning);
  const status = useAppState((s) => s.board.status);
  const screens = useAppState((s) => s.board.screens);
  const epoch = useAppState((s) => s.board.epoch);
  const { x, y, scale } = useAppState((s) => s.viewport);
  const mode = useAppState((s) => s.mode);

  return (
    <div ref={ref} className={`board ${panning ? "is-panning" : ""} mode-${mode}`}>
      {status === "loading" && <div className="board__status">Loading screens…</div>}
      <div
        className="board__content"
        style={{ transform: `translate(${x}px, ${y}px) scale(${scale})`, ["--inv-scale" as string]: 1 / scale }}
      >
        {screens.map((screen, i) => (
          <PreviewCard key={`${epoch}:${screen.id}`} screen={screen} index={i} />
        ))}
      </div>
      <OverlayLayer />
    </div>
  );
}
