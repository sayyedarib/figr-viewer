/** Every tunable number and endpoint in one place. */
export const config = {
  apiBase: import.meta.env.VITE_API_BASE ?? "http://localhost:4000",

  preview: { width: 1280, height: 800 },
  grid: { columns: 4, gapX: 160, gapY: 200, margin: 120 },

  zoom: { min: 0.25, max: 4, initial: 0.3, wheelSensitivity: 0.0015 },
  /** Pointer travel (px) before a press on empty board becomes a pan instead of a click. */
  dragThreshold: 3,

  timeouts: {
    /** No hello from a preview's script within this → "Couldn't connect". */
    connectMs: 10_000,
    /** A connected script that stops answering pings for this long is treated the same way. */
    heartbeatDeadMs: 10_000,
    heartbeatEveryMs: 3_000,
    /** Layers row child loading. */
    childrenMs: 3_000,
    /** Everything else we ask a page (paths, navigation, search). */
    requestMs: 5_000,
  },

  layers: { rowHeight: 24, indent: 14, overscan: 8, searchDebounceMs: 150 },
} as const;
