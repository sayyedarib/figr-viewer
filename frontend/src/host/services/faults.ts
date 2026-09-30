/**
 * Dev-only fault injection. Production code calls `trip(site)` at a few points; it is a
 * no-op unless the dev menu armed that site.
 *
 * An armed site keeps throwing until the failure it causes has been reported
 * (`settle`), because React retries a render that threw once before giving up to the
 * error boundary; a strictly one-shot throw would be silently absorbed by that retry.
 */
export type FaultSite =
  | "overlay-render"
  | "preview-message"
  | "heartbeat-timer"
  | "shortcut"
  | "layers-render"
  | "inspector-render"
  | "details-response";

export class InjectedFault extends Error {
  override name = "InjectedFault";
  constructor(readonly site: FaultSite) {
    super(`Injected failure at ${site}`);
  }
}

export class Faults {
  private readonly armed = new Set<FaultSite>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  /** Previews whose script we pretend never answers. */
  readonly mutedPreviews = new Set<string>();
  /** Next child-list request is swallowed, so the row times out. */
  hangNextChildren = false;
  failNextScreens = false;
  failNextDetails = false;
  detailsLatencyMs = 0;

  arm(site: FaultSite) {
    this.armed.add(site);
    this.changed();
  }

  /** Lets render-time fault sites re-render as soon as they are armed. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  trip(site: FaultSite) {
    if (this.armed.has(site)) throw new InjectedFault(site);
  }

  /** Called once a failure is reported: an injected fault has done its job. */
  settle(error: unknown) {
    if (error instanceof InjectedFault) this.armed.delete(error.site);
  }

  take<K extends "hangNextChildren" | "failNextScreens">(flag: K): boolean {
    const on = this[flag];
    this[flag] = false;
    return on;
  }
}
