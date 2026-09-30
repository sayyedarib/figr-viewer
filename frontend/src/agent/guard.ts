import type { AgentEvent, Mode } from "../shared/protocol";
import { isEditable, isPickable } from "./layers";
import type { NodeRegistry } from "./registry";

/** Everything that could make the page act on a click, keystroke, focus or drag. */
const INERT_IN_SELECT = [
  "click", "dblclick", "auxclick", "mousedown", "mouseup", "pointerup", "contextmenu",
  "touchstart", "touchend", "dragstart", "selectstart", "submit", "keyup", "keypress",
] as const;

const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 800;

/**
 * Owns user input inside the page.
 *
 * Listeners sit on `window` in the capture phase and are registered before any page
 * script runs (the agent is loaded from <head>), so in Select mode no page handler ever
 * sees a click. Hit-testing uses elementFromPoint, which also finds disabled controls,
 * SVG shapes and anything under a sticky header that is visible at the pointer.
 */
export class InteractionGuard {
  private mode: Mode = "select";
  private hovered: Element | null | undefined;
  private pointer: { x: number; y: number } | null = null;

  constructor(
    private readonly registry: NodeRegistry,
    private readonly emit: (e: AgentEvent) => void,
  ) {}

  install() {
    const opts = { capture: true, passive: false } as const;
    for (const type of INERT_IN_SELECT) window.addEventListener(type, this.swallow, opts);
    window.addEventListener("pointerdown", this.onPointerDown, opts);
    window.addEventListener("pointermove", this.onPointerMove, opts);
    window.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    window.addEventListener("wheel", this.onWheel, opts);
    window.addEventListener("keydown", this.onKeyDown, opts);
    document.addEventListener("mouseleave", this.onLeave);
    window.addEventListener("blur", this.onLeave);
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.hovered = undefined;
  }

  /** The host cleared hover by itself; make the next pointer move report again. */
  resetHover() {
    this.hovered = undefined;
  }

  private get selecting() {
    return this.mode === "select";
  }

  private hit(x: number, y: number): Element | null {
    const el = document.elementFromPoint(x, y);
    return isPickable(el) ? el : null;
  }

  private describe(el: Element | null) {
    return el ? { node: this.registry.info(el), path: this.registry.pathOf(el) } : { node: null, path: [] };
  }

  private updateHover() {
    if (!this.selecting || !this.pointer) return;
    const el = this.hit(this.pointer.x, this.pointer.y);
    if (el === this.hovered) return;
    this.hovered = el;
    this.emit({ type: "hover", ...this.describe(el) });
  }

  private readonly swallow = (e: Event) => {
    if (!this.selecting) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!this.selecting) return;
    this.swallow(e);
    if (e.button !== 0) return;
    this.emit({ type: "pick", shift: e.shiftKey, ...this.describe(this.hit(e.clientX, e.clientY)) });
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
    this.updateHover();
  };

  /** Content moving under a still pointer changes what is hovered. */
  private readonly onScroll = () => this.updateHover();

  private readonly onLeave = (e: Event) => {
    if (e.type === "mouseleave" && (e as MouseEvent).relatedTarget) return;
    this.pointer = null;
    this.hovered = undefined;
    this.emit({ type: "pointerLeave" });
  };

  /** Ctrl/Cmd + wheel always belongs to the board's zoom, in both modes. Plain wheel scrolls natively. */
  private readonly onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
    this.emit({ type: "zoom", clientX: e.clientX, clientY: e.clientY, deltaY: e.deltaY * scale });
  };

  /** Shortcuts must work while the page has focus, so every key is offered to the host. */
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const input = { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, editable: isEditable(e.target) };
    this.emit({ type: "key", input });
    if (!this.selecting) return;
    e.stopImmediatePropagation();
    if (!e.ctrlKey && !e.metaKey) e.preventDefault(); // keep browser shortcuts working
  };
}
