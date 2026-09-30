import { describe, expect, it } from "vitest";
import type { NodeInfo } from "../../shared/protocol";
import { hoverRowId, visibleRows } from "./rows";
import { absorbList, emptyDoc, emptyLayers } from "./store";

const node = (id: string, childCount = 0): NodeInfo => ({ id, name: `el-${id}`, tag: "div", key: null, childCount });

function tree() {
  const doc = emptyDoc("d1");
  absorbList(doc, { parentId: null, children: [node("a", 1), node("b", 0)] });
  absorbList(doc, { parentId: "a", children: [node("a1", 0)] });
  return doc;
}

describe("visibleRows", () => {
  it("shows only expanded, loaded branches", () => {
    const doc = tree();
    const view = emptyLayers();
    expect(visibleRows(doc, view).map((r) => r.id)).toEqual(["a", "b"]);
    view.expanded.a = true;
    expect(visibleRows(doc, view).map((r) => [r.id, r.depth])).toEqual([["a", 0], ["a1", 1], ["b", 0]]);
  });

  it("marks an expanded row whose children are not loaded yet as loading", () => {
    const doc = emptyDoc("d");
    absorbList(doc, { parentId: null, children: [node("x", 3)] });
    const view = { ...emptyLayers(), expanded: { x: true as const } };
    expect(visibleRows(doc, view)[0].status).toBe("loading");
  });

  it("search view shows matches with ancestors and ignores the expanded set", () => {
    const doc = tree();
    const view = emptyLayers();
    view.search = { query: "a1", status: "ready", matches: ["a1"], hits: [{ ...node("a", 1), parentId: null }, { ...node("a1"), parentId: "a" }] };
    const rows = visibleRows(doc, view);
    expect(rows.map((r) => [r.id, r.match])).toEqual([["a", false], ["a1", true]]);
    expect(view.expanded).toEqual({});
  });
});

describe("hoverRowId", () => {
  it("falls back to the nearest visible ancestor without expanding anything", () => {
    const rows = visibleRows(tree(), emptyLayers());
    expect(hoverRowId(rows, { previewId: "p", id: "a1", path: ["a"] })).toBe("a");
    expect(hoverRowId(rows, { previewId: "p", id: "b", path: [] })).toBe("b");
  });
});
