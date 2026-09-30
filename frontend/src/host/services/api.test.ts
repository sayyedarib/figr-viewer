import { afterEach, describe, expect, it, vi } from "vitest";
import { BadResponseError, HttpError } from "../errors/errors";
import { ApiClient } from "./api";

const respond = (status: number, body: string) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status }));

describe("ApiClient.details", () => {
  afterEach(() => vi.restoreAllMocks());
  const api = new ApiClient("http://api.test");

  it("treats 404 as 'no details', not an error", async () => {
    respond(404, "{}");
    await expect(api.details("x")).resolves.toEqual({ found: false });
  });

  it("rejects 5xx and malformed bodies", async () => {
    respond(503, "{}");
    await expect(api.details("x")).rejects.toBeInstanceOf(HttpError);
    respond(200, '{"component": "Butt');
    await expect(api.details("x")).rejects.toBeInstanceOf(BadResponseError);
    respond(200, '{"component": 1}');
    await expect(api.details("x")).rejects.toBeInstanceOf(BadResponseError);
  });

  it("validates screens", async () => {
    respond(200, JSON.stringify([{ id: "s", name: "n", url: "http://p/1" }]));
    await expect(api.screens()).resolves.toHaveLength(1);
    respond(200, JSON.stringify({ nope: true }));
    await expect(api.screens()).rejects.toBeInstanceOf(BadResponseError);
  });
});
