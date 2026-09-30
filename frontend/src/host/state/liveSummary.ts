import type { LiveProps } from "../../shared/protocol";

export const MIXED = "Mixed";

/** For several elements: each field's shared value, or "Mixed". Missing data yields null. */
export function summarize(props: (LiveProps | undefined)[]): LiveProps | null {
  if (!props.length || props.some((p) => !p)) return null;
  const [first, ...rest] = props as LiveProps[];
  const out = { ...first };
  for (const key of Object.keys(out) as (keyof LiveProps)[]) {
    if (rest.some((p) => p[key] !== first[key])) out[key] = MIXED;
  }
  return out;
}
