import type { Rect } from "../../../shared/protocol";

export const LABEL_HEIGHT = 18;

/**
 * Label position (preview-local screen px). Above the element when that fits inside
 * the preview, else below it, else tucked inside its top edge.
 */
export function placeLabel(el: Rect, previewHeight: number): { x: number; y: number } {
  const x = Math.max(0, el.x);
  if (el.y - LABEL_HEIGHT >= 0) return { x, y: el.y - LABEL_HEIGHT };
  if (el.y + el.h + LABEL_HEIGHT <= previewHeight) return { x, y: el.y + el.h };
  return { x, y: Math.max(0, el.y) };
}

export const scaleRect = (r: Rect, k: number): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });
