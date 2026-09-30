import type { NodeId } from "../../shared/protocol";

export type RegionKind = "board" | "preview" | "layers" | "layers-row" | "details" | "inspector";

/** Exactly the shape `report()` expects. */
export interface ReportContext {
  region: RegionKind;
  screenId: string | null;
  elementKey?: string;
}

/** A failure-containment unit: an id that scopes its error state, plus what to report. */
export interface Region {
  id: string;
  context: ReportContext;
}

const withKey = (key: string | null | undefined) => (key ? { elementKey: key } : {});

export const regions = {
  board: (): Region => ({ id: "board", context: { region: "board", screenId: null } }),
  preview: (screenId: string): Region => ({ id: `preview:${screenId}`, context: { region: "preview", screenId } }),
  layers: (screenId: string | null): Region => ({ id: "layers", context: { region: "layers", screenId } }),
  layersRow: (screenId: string, nodeId: NodeId, key?: string | null): Region => ({
    id: `layers-row:${screenId}:${nodeId}`,
    context: { region: "layers-row", screenId, ...withKey(key) },
  }),
  details: (screenId: string | null, key?: string | null): Region => ({
    id: "details",
    context: { region: "details", screenId, ...withKey(key) },
  }),
  inspector: (screenId: string | null): Region => ({ id: "inspector", context: { region: "inspector", screenId } }),
};
