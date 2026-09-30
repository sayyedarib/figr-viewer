import { describe, expect, it } from "vitest";
import { intersect } from "../../shared/geometry";
import { LABEL_HEIGHT, placeLabel } from "../features/overlay/placement";
import { MIXED, summarize } from "./liveSummary";
import { toScreen, zoomAround } from "./viewport";
import type { LiveProps } from "../../shared/protocol";

describe("zoomAround", () => {
  it("keeps the board point under the pointer fixed and clamps to 25–400%", () => {
    const v = { x: 100, y: 50, scale: 1 };
    const pointer = { x: 400, y: 300 };
    const boardPoint = { x: (pointer.x - v.x) / v.scale, y: (pointer.y - v.y) / v.scale };
    const z = zoomAround(v, pointer.x, pointer.y, -300);
    const back = toScreen(z, boardPoint.x, boardPoint.y);
    expect(back.x).toBeCloseTo(pointer.x);
    expect(back.y).toBeCloseTo(pointer.y);
    expect(zoomAround(v, 0, 0, -1e6).scale).toBe(4);
    expect(zoomAround(v, 0, 0, 1e6).scale).toBe(0.25);
  });
});

describe("placeLabel", () => {
  it("goes above when there is room, else below, else inside", () => {
    expect(placeLabel({ x: 10, y: 100, w: 50, h: 20 }, 800).y).toBe(100 - LABEL_HEIGHT);
    expect(placeLabel({ x: 10, y: 5, w: 50, h: 20 }, 800).y).toBe(25);
    expect(placeLabel({ x: 10, y: 0, w: 50, h: 800 }, 800).y).toBe(0);
  });
});

describe("intersect", () => {
  it("returns null for disjoint rects", () => {
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBeNull();
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
  });
});

describe("summarize", () => {
  const base: LiveProps = { name: "a", tag: "div", id: "", classes: "", size: "1 × 1", position: "0, 0", text: "", color: "red", background: "", fontFamily: "x", fontSize: "12px", fontWeight: "400" };
  it("keeps shared values and marks differences as Mixed", () => {
    const s = summarize([base, { ...base, name: "b" }])!;
    expect(s.name).toBe(MIXED);
    expect(s.tag).toBe("div");
  });
  it("waits until every element has reported", () => {
    expect(summarize([base, undefined])).toBeNull();
  });
});
