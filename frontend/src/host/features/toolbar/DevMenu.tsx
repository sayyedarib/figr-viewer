import { useState } from "react";
import type { FaultSite } from "../../services/faults";
import { useAppState, useServices } from "../../ui/AppContext";

interface Action {
  label: string;
  run(): void;
  needsPreview?: boolean;
}

/** Dev-only: triggers every failure path on demand (R6.7). */
export function DevMenu() {
  const s = useServices();
  const [open, setOpen] = useState(false);
  const target = useAppState((st) => st.activePreviewId ?? st.board.screens[0]?.id ?? null);
  const arm = (site: FaultSite) => () => s.faults.arm(site);

  const groups: { title: string; actions: Action[] }[] = [
    {
      title: "Board",
      actions: [
        { label: "Reload board, GET /screens fails", run: () => ((s.faults.failNextScreens = true), s.board.load()) },
        { label: "Reload board", run: () => s.board.load() },
        { label: "Throw in next keyboard shortcut", run: arm("shortcut") },
      ],
    },
    {
      title: `Preview (${target ?? "none"})`,
      actions: [
        { label: "Script never answers (10s)", needsPreview: true, run: () => (s.faults.mutedPreviews.add(target!), s.previews.retry(target!)) },
        { label: "Throw handling next page message", run: arm("preview-message") },
        { label: "Throw while drawing outlines", run: arm("overlay-render") },
        { label: "Throw in heartbeat timer", run: arm("heartbeat-timer") },
      ],
    },
    {
      title: "Layers",
      actions: [
        { label: "Next row expand doesn't answer (3s)", run: () => (s.faults.hangNextChildren = true) },
        { label: "Throw while rendering panel", run: arm("layers-render") },
      ],
    },
    {
      title: "Inspector",
      actions: [
        { label: "Next GET /elements fails", run: () => (s.faults.failNextDetails = true) },
        { label: "Toggle slow details (2s)", run: () => (s.faults.detailsLatencyMs = s.faults.detailsLatencyMs ? 0 : 2000) },
        { label: "Throw when details response arrives", run: arm("details-response") },
        { label: "Throw while rendering inspector", run: arm("inspector-render") },
      ],
    },
  ];

  return (
    <div className="dev-menu">
      <button type="button" className="btn btn--ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Dev faults ▾
      </button>
      {open && (
        <div className="dev-menu__panel" role="menu">
          {groups.map((g) => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              {g.actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  disabled={a.needsPreview && !target}
                  onClick={() => {
                    a.run();
                    s.faults.changed();
                    setOpen(false);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </section>
          ))}
          <p className="dev-menu__note">Every failure logs one <code>[report #n]</code> line in the console.</p>
        </div>
      )}
    </div>
  );
}
