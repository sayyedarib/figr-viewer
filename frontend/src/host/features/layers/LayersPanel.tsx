import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { config } from "../../config";
import { regions } from "../../errors/regions";
import { hoverRowId, knownPath, visibleRows } from "../../state/rows";
import { useAppState, useFaultTick, useServices } from "../../ui/AppContext";
import { RegionBoundary } from "../../ui/RegionBoundary";
import { LayerRow } from "./LayerRow";
import { useTreeScroll } from "./useTreeScroll";

export function LayersPanel() {
  const { layers } = useServices();
  const previewId = useAppState((s) => s.activePreviewId);
  return (
    <section className="panel panel--layers" aria-label="Layers">
      <h2 className="panel__title">Layers</h2>
      <RegionBoundary region={regions.layers(previewId)} onRetry={() => previewId && layers.retry(previewId, null)} title="Layers failed">
        {previewId ? <LayersTree previewId={previewId} /> : <p className="panel__empty">Click something in a preview</p>}
      </RegionBoundary>
    </section>
  );
}

function LayersTree({ previewId }: { previewId: string }) {
  const { layers, selection, faults } = useServices();
  useFaultTick();
  faults.trip("layers-render");

  const connected = useAppState((s) => s.previews[previewId]?.connected ?? false);
  const doc = useAppState((s) => s.docs[previewId]);
  const view = useAppState((s) => s.layers[previewId]);
  const hover = useAppState((s) => s.hover);
  const sel = useAppState((s) => s.selection);
  const rootStatus = doc?.lists["#root"]?.status;

  const rows = useMemo(() => visibleRows(doc, view), [doc, view]);

  // Whatever is on screen must be asked for: the root, and any expanded row whose list
  // was dropped (e.g. a cancelled request). ensureList is idempotent.
  useEffect(() => {
    if (!connected) return;
    if (!rootStatus) layers.ensureRoot(previewId);
    for (const r of rows) if (r.expanded && !doc?.lists[r.id]) layers.ensureList(previewId, r.id);
  }, [connected, previewId, rootStatus, rows, doc, layers]);
  const selected = useMemo(() => new Set(sel.previewId === previewId ? sel.ids : []), [sel, previewId]);
  const hoveredRow = hover?.previewId === previewId ? hoverRowId(rows, hover) : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const saveScroll = useCallback((top: number) => layers.saveScroll(previewId, top), [layers, previewId]);
  const { first, last, onScroll, totalHeight } = useTreeScroll(scrollRef, previewId, rows, view, saveScroll);

  const onToggle = useCallback((id: string) => layers.toggle(previewId, id), [layers, previewId]);
  const onRetry = useCallback((id: string) => layers.retry(previewId, id), [layers, previewId]);
  const onSelect = useCallback(
    (id: string, toggle: boolean) => selection.select(previewId, id, { toggle, revealInPage: true }),
    [selection, previewId],
  );
  const onHover = useCallback(
    (id: string | null) => {
      if (id) {
        const d = doc;
        selection.hover(previewId, id, d ? knownPath(d, id) : []);
      } else selection.hover(previewId, null);
    },
    [selection, previewId, doc],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    const actions: Record<string, () => void> = {
      ArrowDown: () => layers.moveSelection(previewId, 1),
      ArrowUp: () => layers.moveSelection(previewId, -1),
      ArrowRight: () => layers.expandOrEnter(previewId),
      ArrowLeft: () => layers.collapseOrExit(previewId),
    };
    const action = actions[e.key];
    if (!action || (e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  const searching = !!view?.search;
  return (
    <div className="layers">
      <input
        className="layers__search"
        type="search"
        placeholder="Search layers"
        value={view?.query ?? ""}
        onChange={(e) => layers.setQuery(previewId, e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && layers.setQuery(previewId, "")}
      />
      {searching && view.search!.status === "loading" && !rows.length && <p className="panel__empty">Searching…</p>}
      {searching && view.search!.status === "ready" && !rows.length && <p className="panel__empty">No layers match “{view.query}”</p>}
      {!searching && (!connected || rootStatus === "loading") && <p className="panel__empty">Loading page…</p>}
      <div ref={scrollRef} className="layers__scroll" tabIndex={0} role="tree" aria-multiselectable onScroll={onScroll} onKeyDown={onKeyDown}>
        <div style={{ height: totalHeight, position: "relative" }}>
          {rows.slice(first, last).map((row, i) => (
            <LayerRow
              key={row.id}
              row={row}
              top={(first + i) * config.layers.rowHeight}
              selected={selected.has(row.id)}
              hovered={row.id === hoveredRow}
              searching={searching}
              onToggle={onToggle}
              onSelect={onSelect}
              onHover={onHover}
              onRetry={onRetry}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
