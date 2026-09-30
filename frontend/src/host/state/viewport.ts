import { config } from "../config";
import type { Viewport } from "./types";

const { width: W, height: H } = config.preview;
const { columns, gapX, gapY } = config.grid;

/** Top-left of the n-th preview's iframe in board coordinates. */
export function previewOrigin(index: number): { x: number; y: number } {
  return { x: (index % columns) * (W + gapX), y: Math.floor(index / columns) * (H + gapY) };
}

export const clampScale = (s: number) => Math.min(config.zoom.max, Math.max(config.zoom.min, s));

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/** Zoom keeping the board point under (px, py) — viewport-relative screen px — fixed. */
export function zoomAround(v: Viewport, px: number, py: number, deltaY: number): Viewport {
  const scale = clampScale(v.scale * Math.exp(-deltaY * config.zoom.wheelSensitivity));
  const k = scale / v.scale;
  return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

/** Board point → screen point (relative to the board viewport element). */
export function toScreen(v: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: v.x + x * v.scale, y: v.y + y * v.scale };
}
