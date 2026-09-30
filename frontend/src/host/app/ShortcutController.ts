import type { KeyInput } from "../../shared/protocol";
import type { Faults } from "../services/faults";
import type { AppStore } from "../state/store";
import type { BoardController } from "./BoardController";
import type { SelectionController } from "./SelectionController";

/**
 * One keyboard map for keys pressed in the host *and* keys forwarded from a page,
 * so shortcuts behave identically wherever focus happens to be.
 * Returns true when the key was consumed.
 */
export class ShortcutController {
  constructor(
    private readonly store: AppStore,
    private readonly board: BoardController,
    private readonly selection: SelectionController,
    private readonly faults: Faults,
  ) {}

  handle(k: KeyInput): boolean {
    this.faults.trip("shortcut");
    if (k.ctrl || k.meta || k.alt || k.editable) return false;
    const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
    if (key === "v") return this.board.setMode("select"), true;
    if (key === "i") return this.board.setMode("interact"), true;

    const { mode, selection } = this.store.getState();
    if (mode !== "select") return false;
    if (key === "Escape") return this.selection.clear(), true;
    if (!selection.ids.length) return false;
    if (key === "Enter") return this.selection.navigate(k.shift ? "parent" : "firstChild");
    if (key === "Tab") return this.selection.navigate(k.shift ? "prevSibling" : "nextSibling");
    return false;
  }
}

export function keyInputFrom(e: KeyboardEvent): KeyInput {
  const t = e.target;
  const editable = t instanceof HTMLElement && (t.isContentEditable || t.matches("input, textarea, select"));
  return { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, editable };
}
