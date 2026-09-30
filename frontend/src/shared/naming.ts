/**
 * The spec's naming rule, shared by the agent (which names elements) and tests.
 * data-name → tag.firstClass → tag#id → tag
 */
export function elementName(el: Element): string {
  const explicit = el.getAttribute("data-name");
  if (explicit) return explicit;
  const tag = el.localName;
  const firstClass = el.classList[0];
  if (firstClass) return `${tag}.${firstClass}`;
  if (el.id) return `${tag}#${el.id}`;
  return tag;
}
