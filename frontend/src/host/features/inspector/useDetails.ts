import { useEffect, useState } from "react";
import { regions } from "../../errors/regions";
import type { ElementDetails } from "../../services/api";
import { useServices } from "../../ui/AppContext";

export type DetailsState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "loaded"; details: ElementDetails };

/**
 * Details for one element key. Changing the key aborts the previous request, so only the
 * latest selection's answer can ever land; an aborted request is "moved on", not an error.
 * Failures go to the Details region (and so to report()) exactly once per attempt.
 */
export function useDetails(screenId: string | null, key: string | null, attempt: number): DetailsState {
  const { api, errors, faults } = useServices();
  const [state, setState] = useState<DetailsState>({ status: "none" });

  useEffect(() => {
    const region = regions.details(screenId, key);
    errors.reset(region.id); // a new subject starts clean
    if (!key) {
      setState({ status: "none" });
      return;
    }
    setState({ status: "loading" });
    const ctrl = new AbortController();
    // The injected failure is consumed only by a request that completes (StrictMode aborts the first).
    const failing = faults.failNextDetails;
    const tuning = { fail: failing ? 1 : 0, latency: faults.detailsLatencyMs };
    const settled = () => failing && (faults.failNextDetails = false);
    const token = errors.token(region);
    api
      .details(key, ctrl.signal, tuning)
      .then((result) => {
        if (ctrl.signal.aborted) return;
        settled();
        faults.trip("details-response");
        setState(result.found ? { status: "loaded", details: result.details } : { status: "notFound" });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        settled();
        errors.fail(region, err, token);
      });
    return () => ctrl.abort();
  }, [api, errors, faults, screenId, key, attempt]);

  return state;
}
