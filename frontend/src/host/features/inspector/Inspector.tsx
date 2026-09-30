import { useLayoutEffect, useState } from "react";
import type { LiveProps } from "../../../shared/protocol";
import { regions } from "../../errors/regions";
import { summarize } from "../../state/liveSummary";
import { useAppShallow, useAppState, useFaultTick, useServices } from "../../ui/AppContext";
import { RegionBoundary } from "../../ui/RegionBoundary";
import { useDetails } from "./useDetails";

const LIVE_FIELDS: { key: keyof LiveProps; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "tag", label: "Tag" },
  { key: "id", label: "ID" },
  { key: "classes", label: "Classes" },
  { key: "size", label: "Size" },
  { key: "position", label: "Position" },
  { key: "text", label: "Text" },
  { key: "color", label: "Text colour" },
  { key: "background", label: "Background" },
  { key: "fontFamily", label: "Font family" },
  { key: "fontSize", label: "Font size" },
  { key: "fontWeight", label: "Font weight" },
];

export function Inspector() {
  const [attempt, setAttempt] = useState(0);
  const screenId = useAppState((s) => s.selection.previewId ?? s.activePreviewId);
  return (
    <section className="panel panel--inspector" aria-label="Inspector">
      <h2 className="panel__title">Inspector</h2>
      <RegionBoundary region={regions.inspector(screenId)} onRetry={() => setAttempt((a) => a + 1)} title="Inspector failed">
        <InspectorBody key={attempt} />
      </RegionBoundary>
    </section>
  );
}

function InspectorBody() {
  const { faults } = useServices();
  useFaultTick();
  faults.trip("inspector-render");

  const { previewId, ids, lost } = useAppState((s) => s.selection);
  const live = useAppShallow((s) => ids.map((id) => (previewId ? s.docs[previewId]?.live[id] : undefined)));
  const key = useAppState((s) => (previewId && ids.length === 1 ? (s.docs[previewId]?.nodes[ids[0]]?.key ?? null) : null));

  if (!ids.length) return <p className="panel__empty">{lost ? "This element no longer exists" : "Select an element to inspect it"}</p>;

  const multiple = ids.length > 1;
  const values = multiple ? summarize(live) : (live[0] ?? null);
  return (
    <div className="inspector">
      {multiple && <p className="inspector__count">{ids.length} elements</p>}
      <h3 className="inspector__section">Live</h3>
      {values ? (
        <dl className="props">
          {LIVE_FIELDS.map((f) => (
            <PropRow key={f.key} label={f.label} value={values[f.key]} swatch={f.key === "color" || f.key === "background"} />
          ))}
        </dl>
      ) : (
        <p className="panel__empty">Reading from page…</p>
      )}
      {!multiple && <Details screenId={previewId} elementKey={key} />}
    </div>
  );
}

function PropRow({ label, value, swatch }: { label: string; value: string; swatch?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd title={value}>
        {swatch && value && value !== "Mixed" && <span className="swatch" style={{ background: value }} />}
        {value || <span className="muted">—</span>}
      </dd>
    </>
  );
}

function Details({ screenId, elementKey }: { screenId: string | null; elementKey: string | null }) {
  const { errors } = useServices();
  const [attempt, setAttempt] = useState(0);
  const region = regions.details(screenId, elementKey);
  // A different element is a new subject: an earlier element's failure must not linger.
  useLayoutEffect(() => errors.reset(region.id), [errors, region.id, screenId, elementKey]);
  return (
    <>
      <h3 className="inspector__section">Details</h3>
      <RegionBoundary region={region} onRetry={() => setAttempt((a) => a + 1)} title="Couldn't load details">
        <DetailsBody screenId={screenId} elementKey={elementKey} attempt={attempt} />
      </RegionBoundary>
    </>
  );
}

function DetailsBody({ screenId, elementKey, attempt }: { screenId: string | null; elementKey: string | null; attempt: number }) {
  const state = useDetails(screenId, elementKey, attempt);
  switch (state.status) {
    case "none":
      return <p className="panel__empty">No details</p>;
    case "loading":
      return <p className="panel__empty">Loading details…</p>;
    case "notFound":
      return <p className="panel__empty">No details for this element</p>;
    case "loaded":
      return (
        <dl className="props">
          <PropRow label="Component" value={state.details.component} />
          <PropRow label="Description" value={state.details.description} />
          <PropRow label="Status" value={state.details.status} />
          <PropRow label="Owner" value={state.details.owner} />
        </dl>
      );
  }
}
