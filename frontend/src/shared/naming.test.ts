import { describe, expect, it } from "vitest";
import { elementName } from "./naming";

const el = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
};

describe("elementName", () => {
  it("follows data-name → tag.class → tag#id → tag", () => {
    expect(el(`<button data-name="Go" class="primary">x</button>`).localName).toBe("button");
    expect(elementName(el(`<button data-name="Go" class="primary">x</button>`))).toBe("Go");
    expect(elementName(el(`<button class="primary ghost" id="b">x</button>`))).toBe("button.primary");
    expect(elementName(el(`<div id="hero"></div>`))).toBe("div#hero");
    expect(elementName(el(`<span></span>`))).toBe("span");
  });

  it("handles SVG class attributes", () => {
    expect(elementName(el(`<svg class="icon"></svg>`))).toBe("svg.icon");
  });
});
