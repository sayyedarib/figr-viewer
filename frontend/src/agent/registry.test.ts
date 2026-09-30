import { beforeEach, describe, expect, it } from "vitest";
import { NodeRegistry } from "./registry";

if (!globalThis.CSS?.escape) Object.assign(globalThis, { CSS: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") } });

/** Mimics page-4: the whole list is re-rendered from data on each tick. */
function renderFeed(items: { id: number; who: string; ago: number }[]) {
  document.getElementById("feed")!.innerHTML = items
    .map((it) => `<li${it.id % 2 ? ` data-key="a-${it.id}"` : ""}><span class="who">${it.who}</span><span class="time">${it.ago}s ago</span></li>`)
    .join("");
}

const q = (sel: string) => document.querySelector(sel)!;

describe("NodeRegistry re-identification", () => {
  let reg: NodeRegistry;
  beforeEach(() => {
    document.body.innerHTML = `<main><ul id="feed"></ul></main>`;
    reg = new NodeRegistry();
  });

  it("keeps an unkeyed item's id when the list is rebuilt and new siblings are inserted before it", () => {
    renderFeed([{ id: 3, who: "Cy", ago: 2 }, { id: 2, who: "Bo", ago: 4 }, { id: 1, who: "Al", ago: 6 }]);
    const id = reg.idOf(q("li:nth-child(2)"));
    const childId = reg.idOf(q("li:nth-child(2) .time"));

    renderFeed([{ id: 5, who: "Ed", ago: 0 }, { id: 4, who: "Di", ago: 2 }, { id: 3, who: "Cy", ago: 4 }, { id: 2, who: "Bo", ago: 6 }, { id: 1, who: "Al", ago: 8 }]);
    const { removed } = reg.reconcile();

    expect(removed).toEqual([]);
    expect(reg.get(id)?.textContent).toContain("Bo");
    expect(reg.get(childId)?.textContent).toBe("6s ago");
  });

  it("follows a keyed element wherever it moves", () => {
    renderFeed([{ id: 3, who: "Cy", ago: 2 }, { id: 1, who: "Al", ago: 4 }]);
    const id = reg.idOf(q('[data-key="a-1"]'));
    renderFeed([{ id: 1, who: "Al", ago: 6 }, { id: 7, who: "Gu", ago: 0 }]);
    reg.reconcile();
    expect(reg.get(id)?.getAttribute("data-key")).toBe("a-1");
  });

  it("retires the id when the element is gone instead of jumping to a neighbour", () => {
    renderFeed([{ id: 3, who: "Cy", ago: 2 }, { id: 2, who: "Bo", ago: 4 }, { id: 1, who: "Al", ago: 6 }]);
    const id = reg.idOf(q("li:nth-child(2)"));
    renderFeed([{ id: 3, who: "Cy", ago: 4 }, { id: 1, who: "Al", ago: 8 }]);
    const { removed } = reg.reconcile();
    expect(removed).toContain(id);
    expect(reg.get(id)).toBeNull();
  });

  it("refuses to guess when several replacements are indistinguishable", () => {
    document.body.innerHTML = `<div><p>same</p><p>same</p></div>`;
    const id = reg.idOf(q("p"));
    document.body.innerHTML = `<div><p>same</p><p>same</p></div>`;
    expect(reg.reconcile().removed).toContain(id);
  });

  it("keeps ids for nodes that were only moved, and reports name changes", () => {
    document.body.innerHTML = `<section><b class="x">hi</b></section><aside></aside>`;
    const el = q("b");
    const id = reg.idOf(el);
    reg.info(el);
    q("aside").appendChild(el);
    el.className = "y";
    const { removed, updated } = reg.reconcile();
    expect(removed).toEqual([]);
    expect(reg.get(id)).toBe(el);
    expect(updated.map((u) => u.name)).toEqual(["b.y"]);
  });
});
