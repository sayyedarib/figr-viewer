import { config } from "../config";
import { BadResponseError, HttpError, isCancellation } from "../errors/errors";

export interface Screen {
  id: string;
  name: string;
  url: string;
}

export interface ElementDetails {
  component: string;
  description: string;
  status: string;
  owner: string;
}

export type DetailsResult = { found: true; details: ElementDetails } | { found: false };

/** Query-string knobs the mock API understands; the dev menu uses them to force failures. */
export interface RequestTuning {
  latency?: number;
  fail?: number;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function parseScreens(data: unknown): Screen[] {
  if (!Array.isArray(data)) throw new BadResponseError("Screens response is not a list");
  return data.map((s) => {
    if (!isRecord(s) || !isString(s.id) || !isString(s.name) || !isString(s.url)) throw new BadResponseError("Malformed screen entry");
    return { id: s.id, name: s.name, url: s.url };
  });
}

function parseDetails(data: unknown): ElementDetails {
  const fields = ["component", "description", "status", "owner"] as const;
  if (!isRecord(data) || !fields.every((f) => isString(data[f]))) throw new BadResponseError("Malformed element details");
  return { component: data.component as string, description: data.description as string, status: data.status as string, owner: data.owner as string };
}

/** Thin, validated client for the mock API. Every call is abortable; nothing here knows about UI. */
export class ApiClient {
  constructor(private readonly base = config.apiBase) {}

  async screens(signal?: AbortSignal, tuning?: RequestTuning): Promise<Screen[]> {
    const res = await this.get("/screens", signal, tuning);
    if (!res.ok) throw new HttpError(res.status);
    return parseScreens(await this.json(res));
  }

  async details(key: string, signal?: AbortSignal, tuning?: RequestTuning): Promise<DetailsResult> {
    const res = await this.get(`/elements/${encodeURIComponent(key)}`, signal, tuning);
    if (res.status === 404) return { found: false };
    if (!res.ok) throw new HttpError(res.status);
    return { found: true, details: parseDetails(await this.json(res)) };
  }

  private get(path: string, signal?: AbortSignal, tuning: RequestTuning = {}) {
    const url = new URL(path, this.base);
    if (tuning.latency) url.searchParams.set("latency", String(tuning.latency));
    if (tuning.fail) url.searchParams.set("fail", String(tuning.fail));
    return fetch(url, { signal });
  }

  private async json(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch (err) {
      if (isCancellation(err)) throw err;
      throw new BadResponseError("Response body is not valid JSON");
    }
  }
}
