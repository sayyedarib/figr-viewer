/**
 * Host ↔ page protocol.
 *
 * Handshake (window.postMessage, the only un-channelled traffic):
 *   page → host   { type: "figr:hello", docId }            once per document load
 *   host → page   { type: "figr:init", mode } + MessagePort one per document
 *
 * Everything after the handshake travels over that document's private MessagePort,
 * so a navigated or reloaded page can never deliver into a stale conversation.
 *
 * Over the port:
 *   host → page   Request  { kind: "req", reqId, body: RequestBody }
 *                 Command  { kind: "cmd", body: CommandBody }           fire and forget
 *   page → host   Response { kind: "res", reqId, ok, result | error }
 *                 Event    { kind: "evt", body: AgentEvent }
 */

export const PROTOCOL = "figr/1";
export const HELLO = "figr:hello";
export const INIT = "figr:init";

export type Mode = "select" | "interact";

/** Opaque, per-document element id. The agent guarantees an id always means the same logical element. */
export type NodeId = string;

export interface NodeInfo {
  id: NodeId;
  name: string;
  tag: string;
  key: string | null;
  childCount: number;
}

/** A rectangle in the page's viewport (CSS px of the preview). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Element box plus the part of it that is actually visible (after every clipping scroll ancestor). */
export interface ElementBox {
  rect: Rect;
  visible: Rect | null;
}

export interface LiveProps {
  name: string;
  tag: string;
  id: string;
  classes: string;
  size: string;
  position: string;
  text: string;
  color: string;
  background: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
}

export type NavDirection = "firstChild" | "parent" | "nextSibling" | "prevSibling";

/** Children of a parent; `parentId: null` means `<body>`. */
export interface ChildList {
  parentId: NodeId | null;
  children: NodeInfo[];
}

export interface SearchHit extends NodeInfo {
  parentId: NodeId | null;
}

// ---------------------------------------------------------------- requests

export type RequestMap = {
  ping: { req: { type: "ping" }; res: "pong" };
  children: { req: { type: "children"; parentId: NodeId | null }; res: ChildList };
  /** Child lists for every ancestor of `id`, from body downwards. */
  path: { req: { type: "path"; id: NodeId }; res: { chain: ChildList[] } };
  navigate: { req: { type: "navigate"; id: NodeId; dir: NavDirection }; res: { target: NodeInfo | null } };
  /** Matches plus all their ancestors, in document order. */
  search: { req: { type: "search"; query: string }; res: { hits: SearchHit[]; matches: NodeId[] } };
  reveal: { req: { type: "reveal"; id: NodeId }; res: { scrolled: boolean } };
};

export type RequestType = keyof RequestMap;
export type RequestBody = RequestMap[RequestType]["req"];
export type ResponseOf<T extends RequestType> = RequestMap[T]["res"];

// ---------------------------------------------------------------- commands

export type CommandBody =
  | { type: "mode"; mode: Mode }
  /** Element boxes the host wants streamed (hover + selection outlines). */
  | { type: "watch"; ids: NodeId[] }
  /** Elements whose live style properties the inspector wants streamed. */
  | { type: "inspect"; ids: NodeId[] }
  /** Host cleared hover on its own (pan/zoom); report the next hover even if unchanged. */
  | { type: "resetHover" };

// ---------------------------------------------------------------- events

export interface KeyInput {
  key: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  /** The key went to an editable field inside the page. */
  editable: boolean;
}

export type AgentEvent =
  | { type: "hover"; node: NodeInfo | null; path: NodeId[] }
  | { type: "pick"; node: NodeInfo | null; path: NodeId[]; shift: boolean }
  | { type: "pointerLeave" }
  | { type: "key"; input: KeyInput }
  | { type: "zoom"; clientX: number; clientY: number; deltaY: number }
  | { type: "boxes"; boxes: Record<NodeId, ElementBox | null> }
  | { type: "live"; props: Record<NodeId, LiveProps> }
  | { type: "dom"; removed: NodeId[]; updated: NodeInfo[]; lists: ChildList[] }
  | { type: "pageError"; message: string };

// ---------------------------------------------------------------- envelopes

export type HostToAgent =
  | { kind: "req"; reqId: number; body: RequestBody }
  | { kind: "cmd"; body: CommandBody };

export type AgentToHost =
  | { kind: "res"; reqId: number; ok: true; result: unknown }
  | { kind: "res"; reqId: number; ok: false; error: string }
  | { kind: "evt"; body: AgentEvent };

export interface HelloMessage {
  type: typeof HELLO;
  protocol: typeof PROTOCOL;
  docId: string;
}

export interface InitMessage {
  type: typeof INIT;
  mode: Mode;
}

export const isHello = (data: unknown): data is HelloMessage =>
  typeof data === "object" && data !== null && (data as HelloMessage).type === HELLO && (data as HelloMessage).protocol === PROTOCOL;

export const isInit = (data: unknown): data is InitMessage =>
  typeof data === "object" && data !== null && (data as InitMessage).type === INIT;

/** Error string an agent returns when a request names an element that no longer exists. */
export const GONE = "gone";
