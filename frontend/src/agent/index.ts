import type { CommandBody, RequestBody } from "../shared/protocol";
import { Bridge } from "./bridge";
import { InteractionGuard } from "./guard";
import { capturePageErrors } from "./pageErrors";
import { NodeRegistry } from "./registry";
import { revealInPage } from "./scroll";
import { Tracker } from "./tracker";
import { TreeQueries } from "./tree";

/**
 * Agent entry point: one classic <script> in each preview page's <head>.
 * Runs before page scripts so its capture listeners and error hooks come first.
 */
(() => {
  const registry = new NodeRegistry();
  const tree = new TreeQueries(registry);

  const bridge: Bridge = new Bridge({
    onConnect: (mode) => {
      guard.setMode(mode);
      observeDom();
    },
    onRequest: (body: RequestBody) => {
      switch (body.type) {
        case "ping":
          return "pong";
        case "children":
          return tree.children(body.parentId);
        case "path":
          return tree.path(body.id);
        case "navigate":
          return tree.navigate(body.id, body.dir);
        case "search":
          return tree.search(body.query);
        case "reveal":
          return { scrolled: revealInPage(tree.require(body.id)) };
      }
    },
    onCommand: (body: CommandBody) => {
      switch (body.type) {
        case "mode":
          return guard.setMode(body.mode);
        case "watch":
          return tracker.watch(body.ids);
        case "inspect":
          return tracker.inspect(body.ids);
        case "resetHover":
          return guard.resetHover();
      }
    },
  });
  const emit = bridge.emit.bind(bridge);
  const guard = new InteractionGuard(registry, emit);
  const tracker = new Tracker(registry, emit);

  function observeDom() {
    new MutationObserver(() => {
      const { removed, updated } = registry.reconcile();
      const lists = tree.changedLists(new Set(removed));
      if (removed.length || updated.length || lists.length) emit({ type: "dom", removed, updated, lists });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  capturePageErrors(emit);
  guard.install();

  const start = () => bridge.start();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
