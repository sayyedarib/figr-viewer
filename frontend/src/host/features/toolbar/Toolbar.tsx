import type { Mode } from "../../../shared/protocol";
import { config } from "../../config";
import { useAppState, useServices } from "../../ui/AppContext";
import { DevMenu } from "./DevMenu";

const MODES: { mode: Mode; label: string; key: string }[] = [
  { mode: "select", label: "Select", key: "V" },
  { mode: "interact", label: "Interact", key: "I" },
];

export function Toolbar() {
  const { board } = useServices();
  const mode = useAppState((s) => s.mode);
  const scale = useAppState((s) => s.viewport.scale);

  const zoomTo = (target: number) => {
    const el = document.querySelector(".board");
    const r = el?.getBoundingClientRect();
    board.setZoom(target, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);
  };

  return (
    <header className="toolbar">
      <span className="toolbar__brand">Figr Viewer</span>
      <div className="segmented" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={mode === m.mode}
            className={mode === m.mode ? "segmented__item is-active" : "segmented__item"}
            onClick={() => board.setMode(m.mode)}
            title={`${m.label} (${m.key})`}
          >
            {m.label} <kbd>{m.key}</kbd>
          </button>
        ))}
      </div>
      <div className="toolbar__zoom">
        <button type="button" className="btn btn--ghost" onClick={() => zoomTo(board.nextZoomStep(scale, -1))} aria-label="Zoom out">−</button>
        <button type="button" className="btn btn--ghost toolbar__zoom-value" onClick={() => zoomTo(1)} title="Reset to 100%">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => zoomTo(board.nextZoomStep(scale, 1))} aria-label="Zoom in">+</button>
        <span className="toolbar__hint">{Math.round(config.zoom.min * 100)}–{Math.round(config.zoom.max * 100)}%</span>
      </div>
      <div className="toolbar__spacer" />
      {import.meta.env.DEV && <DevMenu />}
    </header>
  );
}
