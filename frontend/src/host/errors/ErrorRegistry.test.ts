import { describe, expect, it, vi } from "vitest";
import { CancelledError } from "./errors";
import { ErrorRegistry, type FailureSink } from "./ErrorRegistry";
import { regions } from "./regions";

function setup() {
  const failures = new Map<string, { message: string }>();
  const sink: FailureSink = {
    setFailure: (id, f) => (f ? failures.set(id, f) : failures.delete(id)),
    hasFailure: (id) => failures.has(id),
  };
  const reporter = vi.fn();
  return { registry: new ErrorRegistry(sink, reporter), reporter, failures };
}

describe("ErrorRegistry", () => {
  const region = regions.details("scr-01", "cta-primary");

  it("reports a failure exactly once, however many times it is thrown", () => {
    const { registry, reporter, failures } = setup();
    registry.fail(region, new Error("boom"));
    registry.fail(region, new Error("boom again"));
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(expect.any(Error), { region: "details", screenId: "scr-01", elementKey: "cta-primary" });
    expect(failures.get(region.id)?.message).toBe("boom");
  });

  it("counts a failure after retry as a new failure", () => {
    const { registry, reporter } = setup();
    registry.fail(region, new Error("1"));
    registry.reset(region.id);
    registry.fail(region, new Error("2"));
    expect(reporter).toHaveBeenCalledTimes(2);
  });

  it("ignores cancellations and aborts", () => {
    const { registry, reporter, failures } = setup();
    registry.fail(region, new CancelledError());
    registry.fail(region, new DOMException("aborted", "AbortError"));
    expect(reporter).not.toHaveBeenCalled();
    expect(failures.size).toBe(0);
  });

  it("drops late failures from work that started before the region was reset or disposed", async () => {
    const { registry, reporter } = setup();
    let rejectLate!: (e: Error) => void;
    const tracked = registry.track(region, new Promise((_, reject) => (rejectLate = reject)));
    registry.dispose(region.id);
    rejectLate(new Error("late"));
    await tracked;
    expect(reporter).not.toHaveBeenCalled();
  });

  it("turns throws inside guarded callbacks into the region's failure", () => {
    const { registry, reporter } = setup();
    registry.guard(region, () => {
      throw new Error("in handler");
    })();
    expect(reporter).toHaveBeenCalledTimes(1);
  });
});
