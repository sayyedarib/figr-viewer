import { report } from "../../../report.js";
import { ErrorRegistry } from "../errors/ErrorRegistry";
import { ApiClient } from "../services/api";
import { ConnectionHub } from "../services/ConnectionHub";
import { Faults } from "../services/faults";
import { createAppStore, type AppStore } from "../state/store";
import { BoardController } from "./BoardController";
import { LayersController } from "./LayersController";
import { PreviewController } from "./PreviewController";
import { SelectionController } from "./SelectionController";
import { ShortcutController } from "./ShortcutController";
import { SyncController } from "./SyncController";

export interface AppServices {
  store: AppStore;
  api: ApiClient;
  errors: ErrorRegistry;
  faults: Faults;
  hub: ConnectionHub;
  board: BoardController;
  selection: SelectionController;
  layers: LayersController;
  shortcuts: ShortcutController;
  previews: PreviewController;
  sync: SyncController;
  dispose(): void;
}

/** Composition root: the one place that knows how the pieces are wired together. */
export function createServices(): AppServices {
  const store = createAppStore();
  const api = new ApiClient();
  const faults = new Faults();
  const errors = new ErrorRegistry(
    {
      setFailure: (id, failure) =>
        store.setState((d) => {
          if (failure) d.failures[id] = failure;
          else delete d.failures[id];
        }),
      hasFailure: (id) => id in store.getState().failures,
    },
    (error, context) => {
      faults.settle(error);
      report(error, context);
    },
  );
  const hub = new ConnectionHub();
  const board = new BoardController(store, api, errors, faults);
  const layers = new LayersController(store, hub, errors, faults);
  const selection = new SelectionController(store, hub, errors, layers);
  layers.selectRow = (previewId, id, toggle) => selection.select(previewId, id, { toggle, revealInPage: true });
  const shortcuts = new ShortcutController(store, board, selection, faults);
  const sync = new SyncController(store, hub).start();
  const previews = new PreviewController(store, hub, errors, faults, board, selection, layers, shortcuts, (id) => sync.resync(id));

  return {
    store, api, errors, faults, hub, board, selection, layers, shortcuts, previews, sync,
    dispose() {
      sync.stop();
      hub.destroy();
    },
  };
}
