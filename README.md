# Figr Viewer — board of live, inspectable previews

A design-tool viewer: 24 live cross-origin previews on a pannable, zoomable board. The host draws hover/selection outlines over them, shows a layers tree and an inspector, and contains every failure to the region it happened in.

```bash
npm install
npm run dev        # mock API :4000, preview pages :4001, app :5173  →  open http://localhost:5173
npm test           # unit tests (vitest + jsdom)
npm run build      # typecheck + production build (dist/, incl. dist/agent.js)
```

Node 18+. The **Dev faults** menu (top right, dev builds only) triggers every failure in R6 on demand. Each failure prints one `[report #n]` line in the console.

Stack: TypeScript, React 19, Zustand (+ Immer), Vite, esbuild (for the page agent), Vitest.

---

## 1. Shape of the solution

```
┌──────────────────────────── host (localhost:5173) ─────────────────────────────┐
│  React UI (features/*)          reads state, calls controllers, never mutates   │
│        │ selectors                           ▲                                  │
│        ▼                                     │ actions                          │
│  Zustand store (state/*)  ◄──── controllers (app/*) ────► ErrorRegistry → report │
│                                     │   ▲                                       │
│                         commands/requests │ events/responses                    │
│                                     ▼   │                                       │
│             ConnectionHub ── PreviewConnection (one MessagePort per document)   │
└─────────────────────────────────────┬───┴───────────────────────────────────────┘
                                      │ postMessage handshake, then MessagePort
┌─────────────────────── each preview page (localhost:4001) ─────────────────────┐
│  agent.js (one <script> in <head>):                                             │
│   Bridge · InteractionGuard · NodeRegistry · TreeQueries · Tracker · pageErrors │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Main calls:

1. **The page does the reading, the host does the drawing.** Only code inside the page can read the DOM (the pages are cross-origin), so a small agent inside each page answers questions and streams geometry. All UI (outlines, labels, tree, inspector) is host-owned, so it can span previews and survive page crashes.
2. **Select mode is enforced inside the page, not by a shield over the iframe.** The agent's capture-phase listeners on `window` are registered from `<head>`, before any page script, and swallow clicks, keys, focus, drag and submit. The alternative, a transparent host shield, would mean faking wheel scrolling into cross-origin pages, including inner scroll areas. Doing it inside the page keeps native scrolling in both modes. Hit-testing uses `elementFromPoint`, which also finds disabled controls, SVG shapes and content under a sticky header.
3. **Stable element ids owned by the agent.** The host never sees DOM nodes, only opaque ids. The agent guarantees an id always means the same *logical* element, or it retires the id (section 4).
4. **One store, written only by controllers.** Components are pure readers plus event forwarders. Everything derived (visible rows, "Mixed" values, label placement, zoom maths) is a pure function with unit tests.
5. **One failure pipeline.** Every error from render, handler, timer, message or response goes to `ErrorRegistry.fail(region, error, token?)`. That call decides "report or ignore" in one place.

---

## 2. How state is organised: what lives where, and who may change it

| State | Where | Written by | Notes |
|---|---|---|---|
| `mode`, `viewport` | store | `BoardController` | pan/zoom/mode also clear `hover` |
| `board` (screens, epoch) | store | `BoardController.load` | a reload drops *all* per-preview state |
| `previews[id]` (mount, connected, pageErrors) | store | `PreviewController` | `mount` bump = reload that iframe only (Retry) |
| `docs[id]`: what we know about the **current document** in a preview (node infos, parent links, child lists, boxes, live styles) | store | `PreviewController`, `LayersController` | replaced wholesale on navigation, so stale ids can't leak |
| `layers[id]`: panel view per preview (expanded, scrollTop, query, search results) | store | `LayersController` | kept across preview switches (R4.9); reset on navigation/board reload |
| `hover`, `selection`, `activePreviewId` | store | `SelectionController` | single hover on the whole board; selection is `{previewId, ids[], lost}` |
| `failures` | store | `ErrorRegistry` only | rendered by `RegionBoundary` |
| region generations | `ErrorRegistry` (private) | `ErrorRegistry` | decides whether late work still counts |
| DOM identity (id ↔ element, descriptors) | agent `NodeRegistry` | agent | never crosses the boundary |
| Open requests, timers, ports | `PreviewConnection` | itself | disposed with the iframe |

Rules that keep it honest:
- **Components never write state.** They call controller methods (`selection.select`, `layers.toggle`, …).
- **Only `SyncController` talks to agents about subscriptions.** It derives "which ids to stream boxes/styles for" from `hover + selection + mode` and diffs before sending. No component sends messages.
- **Controllers depend on abstractions they are given.** `createServices()` (the composition root, `host/app/services.ts`) is the one place that wires concrete classes. `ErrorRegistry` knows nothing about React or Zustand; it gets a `FailureSink` and a `Reporter`.

---

## 3. Host ↔ page protocol

Defined once in `frontend/src/shared/protocol.ts` and imported by both sides.

**Handshake (the only `window.postMessage` traffic):**
1. On `DOMContentLoaded` the page sends `figr:hello {docId}` to its parent, retrying each second up to 10 times. `docId` is random per document load.
2. `ConnectionHub` accepts it only if `event.source` is a known preview iframe's `contentWindow` *and* `event.origin` matches that screen's origin.
3. The host creates a `MessageChannel` and sends `figr:init {mode}` with one port. The agent accepts exactly one port, and only from `window.parent`.

**Over the port:**

| Direction | Message | Purpose |
|---|---|---|
| host → page, request | `ping` · `children {parentId}` · `path {id}` · `navigate {id, dir}` · `search {query}` · `reveal {id}` | answered with `res {reqId, ok, result/error}`; `error: "gone"` = element no longer exists |
| host → page, command | `mode` · `watch {ids}` · `inspect {ids}` · `resetHover` | fire-and-forget subscriptions |
| page → host, event | `hover {node, path}` · `pick {node, path, shift}` · `pointerLeave` · `key {…, editable}` · `zoom {clientX, clientY, deltaY}` | input |
| page → host, event | `boxes {id: {rect, visible}}` · `live {id: props}` | streamed only while watched, only when changed (rAF polling) |
| page → host, event | `dom {removed, updated, lists}` | after each mutation batch: retired ids, renamed nodes, changed child lists (only for lists the host has loaded) |
| page → host, event | `pageError {message}` | uncaught errors / unhandled rejections in the page |

**When one side is slow, gone or replaced:**
- **Slow:** every request has its own timeout. Tree rows get 3 s ("Couldn't load" + Retry on that row); other requests get 5 s. A late answer finds no pending entry and is dropped.
- **Gone:** no hello within 10 s, or a `ping` (every 3 s) unanswered for 10 s, shows "Couldn't connect to this preview" on that preview only. Pings pause while the host tab is hidden.
- **Replaced (navigation or reload):** the new document sends a hello with a new `docId`. The old port is closed, and its pending requests are rejected with `CancelledError`, which is never shown or reported. That preview's `docs`, layers view, hover and selection are reset. Because each document has its own port, a message from the old page *cannot* arrive into the new conversation.
- **Host gone:** the agent stays inert (it only acts on messages from its port).
- The agent is served by the host dev server at `http://localhost:5173/agent.js` (built on request by a small Vite plugin, `tools/agentPlugin.ts`), so the one allowed `<script>` tag is identical in every page.

---

## 4. Identifying elements across re-renders and navigation

`agent/registry.ts`. Each element the host has seen gets an id plus a **descriptor**: tag, class string, `data-name`, `data-key`, `id`, parent id, nearest keyed/id'd sibling before and after (the *anchors*), offset from the previous anchor, and a text fingerprint (whitespace collapsed, digits masked so `2s ago` ≈ `4s ago`). Descriptors are refreshed after every mutation batch, while the node is still alive.

After a mutation batch, ids are processed parents-first. A node that is still connected keeps its id, even if it moved. A disconnected node's id moves to a replacement **only if exactly one candidate qualifies**:
1. a unique element with the same `data-key` (and tag), else the same `id`;
2. otherwise, among the (already re-resolved) parent's children with the same tag/class/name/key/id: filter by surviving anchors; if no anchor survived, or several candidates remain, require the same text fingerprint; last tie-break is the anchor offset.

Zero or several candidates means the id is **retired**, not guessed. The host removes it from selection, hover and the tree, and if that empties the selection the inspector says "This element no longer exists". Page 4 shows why each rule exists: odd items have `data-key`, even ones don't but sit between keyed siblings (anchors), and their children match by class and text. New items are inserted *before* the selection, so positional indexes alone would jump.

Navigation is not re-identification: a new document means a new `docId`, and every id from the old one is dropped with its state (R3.8).

---

## 5. How the tree loads

- Rows are children of `<body>`, loaded when the panel first shows a preview. A row's children load the first time it is expanded (`children {parentId}`).
- **At most one request per (document, parent).** The list slot goes `loading → loaded | error`. `ensureList` is a no-op unless the slot is empty, so collapse and re-expand (even mid-load) reuse the in-flight request. Results *replace* the list, so duplicates are impossible. Only the attempt that still owns the `loading` slot may resolve it; this matters when a `path` reveal or a DOM push fills the list first.
- **Selecting in a preview** sends one `path {id}`, which returns every ancestor's child list in a single round trip (page 5 is 30 levels deep). The controller marks them loaded and expanded, then scrolls the row into view.
- **DOM changes** arrive as `dom` events carrying new child lists for *loaded* parents only. Ids that survived keep their expanded and selected state because that state is keyed by id. The panel is virtualized with a fixed row height, so scroll anchoring is exact arithmetic: find the first previously visible row that still exists and shift `scrollTop` by its index delta.
- **Search** asks the page (`search {query}`), which walks the *whole* DOM and returns matches plus ancestors in document order. Search results are a separate view; the expanded set is never touched. Clearing the search therefore restores the exact prior expansion, and the saved tree scroll position.

---

## 6. How failures are contained and reported

- **Regions**: `board`, `preview:<screen>`, `layers`, `layers-row:<screen>:<node>`, `details`, `inspector` (`host/errors/regions.ts`). Each carries the exact `{region, screenId, elementKey?}` context `report()` expects.
- **Single path:** render errors reach it via `RegionBoundary` (a React error boundary per region). Handlers and timers are wrapped with `errors.guard(region, fn)`. Promises go through `errors.track(region, promise)`. Page messages are handled inside the preview's guard. All of these call `ErrorRegistry.fail`, which:
  - ignores `CancelledError` / `AbortError` ("user moved on"),
  - ignores work whose **region token** is stale (the region was retried, reset for a new subject, or disposed). This is how "a response after its region is gone changes nothing",
  - ignores further errors while the region is already failed (a cascade is *one* failure),
  - otherwise records the failure (so the region renders its error and Retry) and calls `report()` **once**.
- **Retry** resets the region, which bumps its generation, so failing again is a *new* failure and reported again.
- **Details:** changing the selection aborts the previous request and resets the Details region, so only the latest selection's answer can land and an earlier element's error never lingers. A 404 is data ("No details for this element"), not an error.
- **Page errors** (from the page's own code) show as a badge with the messages on hover, and are reported once per occurrence *without* taking the preview down.

---

## 7. Ambiguities and what I decided

1. **Which elements are layers?** `<script>`, `<style>`, `<template>`, etc. are elements but never render a box. They are hidden from the tree, search and Tab/Enter navigation.
2. **Page errors** are failures (so they're reported) but not region failures (the page still works), so the preview gets a badge rather than an error screen.
3. **Clicking page background** clears the selection *and* makes that preview active; it is still a Select-mode click in that preview.
4. **Selection happens on `pointerdown`** (primary button), like design tools. The rest of the click sequence is swallowed.
5. **Keys while typing:** V/I/Esc/Enter/Tab are ignored when focus is in an editable field (the layers search box, or a page input in Interact mode). In Interact mode, Enter/Tab/Escape belong to the page; only V and I switch modes.
6. **"Scrolled fully out of view"** includes inner scroll areas, not only the preview edge. The agent intersects the box with every clipping ancestor, and the host clips the outline to that visible part and to the preview.
7. **Label placement** uses the element's full box: above if that fits inside the preview, else below, else inside the top edge.
8. **Search** is a case-insensitive substring match on the element name. While searching, chevrons are disabled (everything relevant is open), and selecting a result doesn't change the pre-search expanded state.
9. **Where does a failing keyboard shortcut belong?** To the preview whose selection it acts on (else the active preview, else the board).
10. **Root children failing to load** is a failure of the *layers panel* region. A row's children failing is that *row's* region.
11. **"Position within the page"** is document coordinates (`rect + scroll`) at the current scroll.
12. **Multi-select Live values** show only once every selected element has reported; a field is "Mixed" when any value differs.
13. **Preview Retry** reloads that one iframe. **Board Retry/reload** drops all remembered layer state, per "until … the board reloads".

---

## 8. Where this breaks

- **Identity is a heuristic with a safe failure mode.** An unkeyed element with no surviving anchors whose text really changes (for example "1m ago" once digits are masked) is treated as removed. Two indistinguishable siblings with no anchors are also treated as removed. It will drop a selection, never move it to another element. On page 4 unkeyed items live at most 50 s, so this never triggers there.
- **Mode switch vs. an instant click.** Mode reaches the page as a port message, and browsers prioritise input events. A click within a few milliseconds of pressing **I** can still be swallowed by Select mode. The host ignores that `pick`, but the page doesn't get the click.
- **Clipping approximation.** An absolutely positioned child escapes an `overflow` ancestor that isn't its containing block. We still clip it (outline too small). Transformed or rotated elements get their axis-aligned bounding box.
- **`pointer-events: none` elements** can't be hovered in the page (`elementFromPoint` skips them). They are still reachable from the layers panel and with Enter/Tab.
- **Shadow DOM and nested iframes** are not traversed.
- **Keyboard scrolling of a page** (arrows/space) is disabled in Select mode because the agent swallows keys there. Wheel scrolling works.
- **Very large or very chatty pages:** search walks the whole DOM and re-runs (debounced) after DOM changes while a query is active. Reconciliation is O(ids the host has seen) per mutation batch.
- **Agent location is fixed** at `http://localhost:5173/agent.js` (the one script tag). Another host port means editing the tag.
- **Outlines lag one frame** behind in-page scrolling because boxes arrive by message.

**With another week:** use `ResizeObserver`/`IntersectionObserver` plus scroll listeners instead of rAF polling for boxes, and a `MutationObserver`-driven dirty set instead of full reconciliation. Add Playwright end-to-end tests for R1–R6 (I scripted them by hand while building). Let the host send the mode with a sequence number, and have the agent ack before Interact takes effect. Add ARIA tree semantics end to end, and throttle hover messages.

---

## 9. Code map

```
frontend/src/
  shared/      protocol.ts (the contract), naming.ts, geometry.ts
  agent/       index.ts (entry) · bridge.ts · guard.ts (Select-mode input) · registry.ts (identity)
               tree.ts (children/path/search/navigate) · tracker.ts (boxes + live styles) · boxes.ts · scroll.ts · pageErrors.ts
  host/
    app/       services.ts (composition root) + one controller per concern:
               Board · Preview · Selection · Layers · Shortcut · Sync
    services/  api.ts (validated fetch) · PreviewConnection.ts · ConnectionHub.ts · faults.ts (dev)
    errors/    ErrorRegistry.ts · regions.ts · errors.ts
    state/     store.ts · types.ts · rows.ts · viewport.ts · liveSummary.ts   (pure)
    features/  board · overlay · layers · inspector · toolbar
    ui/        AppContext.tsx · RegionBoundary.tsx · ErrorNotice.tsx
backend/pages/*.html   + one <script src="http://localhost:5173/agent.js"> each (nothing else changed)
```

## 10. Prior art

- **Design-tool conventions (Figma, Framer):** magenta hover and blue selection outlines drawn in screen space with fixed-size name tags, and the layers panel's hover/selection sync. These conventions read instantly for the intended users.
- **Browser DevTools element picker:** "hit-test with `elementFromPoint`, show the element's box and name". It already solves "what is under the pointer" for disabled controls and SVG.

## 11. How AI was used

Built with Claude Code as a pair: architecture discussion, drafting modules, and driving a real Chromium through Playwright to check each requirement against the running app. Things it got wrong along the way, caught by those runs:
- One-shot dev faults: React StrictMode double-runs effects and React retries a render that threw once, so a "throw once" fault vanished silently. Faults now stay armed until their failure is reported.
- A cancelled child-list request deleted a list that a `path` reveal had already filled. Only the attempt that owns the `loading` slot may resolve it now.
- Cancelling in-flight requests on tab visibility changes caused spurious failures. It was removed; the page's message handling isn't throttled anyway.
- Two fast Tab presses both navigated from the same element. Keyboard steps are now serialized.
