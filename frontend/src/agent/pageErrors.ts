import type { AgentEvent } from "../shared/protocol";

/** Surfaces the page's own uncaught errors and unhandled rejections to the host. */
export function capturePageErrors(emit: (e: AgentEvent) => void) {
  const describe = (reason: unknown) =>
    reason instanceof Error ? `${reason.name}: ${reason.message}` : typeof reason === "string" ? reason : JSON.stringify(reason);

  window.addEventListener("error", (e) => {
    if (!(e instanceof ErrorEvent)) return; // resource load errors are not script errors
    emit({ type: "pageError", message: e.error ? describe(e.error) : e.message });
  });
  window.addEventListener("unhandledrejection", (e) => emit({ type: "pageError", message: describe(e.reason) }));
}
