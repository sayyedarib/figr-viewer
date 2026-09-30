import type { AppServices } from "./app/services";
import { Board } from "./features/board/Board";
import { Inspector } from "./features/inspector/Inspector";
import { LayersPanel } from "./features/layers/LayersPanel";
import { Toolbar } from "./features/toolbar/Toolbar";
import { useGlobalShortcuts } from "./features/toolbar/useGlobalShortcuts";
import { ServicesProvider } from "./ui/AppContext";

export function App({ services }: { services: AppServices }) {
  return (
    <ServicesProvider services={services}>
      <Shell />
    </ServicesProvider>
  );
}

function Shell() {
  useGlobalShortcuts();
  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <Board />
        <aside className="sidebar">
          <LayersPanel />
          <Inspector />
        </aside>
      </main>
    </div>
  );
}
