import { isCancellation, toError } from "./errors";
import type { Region, ReportContext } from "./regions";

export type Reporter = (error: Error, context: ReportContext) => void;

/** Where failures are displayed. Implemented by the store; kept abstract so this class stays UI-agnostic. */
export interface FailureSink {
  setFailure(regionId: string, failure: { message: string } | null): void;
  hasFailure(regionId: string): boolean;
}

/** Captures "which incarnation of a region started this work". */
export interface RegionToken {
  readonly regionId: string;
  readonly generation: number;
}

/**
 * The single path every failure takes, wherever it was thrown.
 *
 * Guarantees:
 *  - Reported exactly once: a region that is already failed swallows further errors
 *    until it is retried, so a cascade is one failure.
 *  - A retry starts a new generation; failing again is a new failure.
 *  - Cancellations are never failures.
 *  - Work tagged with a stale token (region retried, reset or gone) changes nothing.
 */
export class ErrorRegistry {
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly sink: FailureSink,
    private readonly reporter: Reporter,
  ) {}

  token(region: Region | string): RegionToken {
    const regionId = typeof region === "string" ? region : region.id;
    return { regionId, generation: this.generation(regionId) };
  }

  isCurrent(token: RegionToken): boolean {
    return this.generation(token.regionId) === token.generation;
  }

  fail(region: Region, error: unknown, token?: RegionToken): void {
    if (isCancellation(error)) return;
    if (token && !this.isCurrent(token)) return;
    if (this.sink.hasFailure(region.id)) return;
    const err = toError(error);
    this.sink.setFailure(region.id, { message: err.message });
    this.reporter(err, region.context);
  }

  /** User pressed Retry, or the region's subject changed: forget the failure, invalidate in-flight work. */
  reset(regionId: string): void {
    this.generations.set(regionId, this.generation(regionId) + 1);
    if (this.sink.hasFailure(regionId)) this.sink.setFailure(regionId, null);
  }

  /** Reset every region whose id matches, e.g. all rows of a preview that navigated. */
  resetWhere(match: (regionId: string) => boolean, knownIds: Iterable<string>): void {
    const ids = new Set([...this.generations.keys(), ...knownIds]);
    for (const id of ids) if (match(id)) this.reset(id);
  }

  /** A failure that is shown without taking its region down (a "Page error" badge). Reported once per call. */
  note(region: Region, error: unknown): void {
    this.reporter(toError(error), region.context);
  }

  /** Region no longer exists. Identical bookkeeping to reset; named for intent at call sites. */
  dispose(regionId: string): void {
    this.reset(regionId);
  }

  /** Wraps a callback so anything it throws becomes this region's failure. */
  guard<A extends unknown[]>(region: Region, fn: (...args: A) => void): (...args: A) => void {
    return (...args: A) => {
      try {
        fn(...args);
      } catch (err) {
        this.fail(region, err);
      }
    };
  }

  /** Attaches failure handling to async work that belongs to `region`, bound to its current generation. */
  track<T>(region: Region, work: Promise<T>): Promise<T | undefined> {
    const token = this.token(region);
    return work.catch((err) => {
      this.fail(region, err, token);
      return undefined;
    });
  }

  private generation(regionId: string): number {
    return this.generations.get(regionId) ?? 0;
  }
}
