import { config } from "../config";
import type { ErrorRegistry } from "../errors/ErrorRegistry";
import { regions } from "../errors/regions";
import type { ApiClient } from "../services/api";
import type { Faults } from "../services/faults";
import { emptySelection, screensToPreviews, type AppStore } from "../state/store";
import { panBy, zoomAround } from "../state/viewport";
import type { Mode } from "../../shared/protocol";

/** Board lifecycle (loading screens), viewport and mode. */
export class BoardController {
  private inflight: AbortController | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly api: ApiClient,
    private readonly errors: ErrorRegistry,
    private readonly faults: Faults,
  ) {}

  /** (Re)load the board. Everything per-preview is forgotten, as the spec's "board reloads" implies. */
  load() {
    this.inflight?.abort();
    const ctrl = (this.inflight = new AbortController());
    this.errors.resetWhere(() => true, Object.keys(this.store.getState().failures));
    this.store.setState((d) => {
      d.board = { status: "loading", screens: [], epoch: d.board.epoch + 1 };
      d.previews = {};
      d.docs = {};
      d.layers = {};
      d.hover = null;
      d.selection = emptySelection();
      d.activePreviewId = null;
    });
    const tuning = this.faults.take("failNextScreens") ? { fail: 1 } : undefined;
    const work = this.api.screens(ctrl.signal, tuning).then((screens) => {
      this.store.setState((d) => {
        d.board.status = "ready";
        d.board.screens = screens;
        d.previews = screensToPreviews(screens);
      });
    });
    void this.errors.track(regions.board(), work);
  }

  setMode(mode: Mode) {
    this.store.setState((d) => {
      d.mode = mode;
      d.hover = null;
    });
  }

  pan(dx: number, dy: number) {
    this.store.setState((d) => {
      d.viewport = panBy(d.viewport, dx, dy);
      d.hover = null;
    });
  }

  zoomAt(px: number, py: number, deltaY: number) {
    this.store.setState((d) => {
      d.viewport = zoomAround(d.viewport, px, py, deltaY);
      d.hover = null;
    });
  }

  /** Toolbar +/−: the next "round" zoom level in a direction. */
  nextZoomStep(scale: number, dir: 1 | -1): number {
    const steps = [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4];
    const next = dir > 0 ? steps.find((s) => s > scale + 1e-3) : [...steps].reverse().find((s) => s < scale - 1e-3);
    return next ?? scale;
  }

  setZoom(scale: number, px: number, py: number) {
    const v = this.store.getState().viewport;
    // Express the absolute target as the equivalent wheel delta so there is one zoom path.
    this.zoomAt(px, py, -Math.log(scale / v.scale) / config.zoom.wheelSensitivity);
  }
}
