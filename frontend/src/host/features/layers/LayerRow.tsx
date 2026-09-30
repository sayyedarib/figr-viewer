import { memo } from "react";
import { config } from "../../config";
import type { Row } from "../../state/rows";

interface Props {
  row: Row;
  top: number;
  selected: boolean;
  hovered: boolean;
  searching: boolean;
  onToggle(id: string): void;
  onSelect(id: string, toggle: boolean): void;
  onHover(id: string | null): void;
  onRetry(id: string): void;
}

export const LayerRow = memo(function LayerRow({ row, top, selected, hovered, searching, onToggle, onSelect, onHover, onRetry }: Props) {
  const cls = ["layer-row", selected && "is-selected", hovered && "is-hovered", searching && !row.match && "is-context"].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      style={{ top, height: config.layers.rowHeight, paddingLeft: 6 + row.depth * config.layers.indent }}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={selected}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
      onMouseDown={(e) => e.shiftKey && e.preventDefault() /* no text selection on shift+click */}
      onClick={(e) => onSelect(row.id, e.shiftKey)}
    >
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          className={`layer-row__chevron ${row.expanded ? "is-open" : ""}`}
          aria-label={row.expanded ? "Collapse" : "Expand"}
          disabled={searching}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(row.id);
          }}
        >
          ▸
        </button>
      ) : (
        <span className="layer-row__chevron-space" />
      )}
      <span className="layer-row__name">{row.name}</span>
      {row.status === "loading" && <span className="layer-row__status">Loading…</span>}
      {row.status === "error" && (
        <span className="layer-row__status layer-row__status--error">
          Couldn't load
          <button
            type="button"
            className="btn btn--tiny"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(row.id);
            }}
          >
            Retry
          </button>
        </span>
      )}
    </div>
  );
});
