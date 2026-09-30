/** The user moved on (new selection, navigation, unmount). Never shown, never reported. */
export class CancelledError extends Error {
  override name = "CancelledError";
  constructor(reason = "cancelled") {
    super(reason);
  }
}

export class TimeoutError extends Error {
  override name = "TimeoutError";
}

/** A response arrived but did not have the shape we require. */
export class BadResponseError extends Error {
  override name = "BadResponseError";
}

export class HttpError extends Error {
  override name = "HttpError";
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export function isCancellation(err: unknown): boolean {
  return err instanceof CancelledError || (err instanceof DOMException && err.name === "AbortError");
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
}
