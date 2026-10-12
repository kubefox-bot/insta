import { expect, test } from "bun:test";
import type { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import { commonErrorSchema, envelopeSchema } from "@insta/contracts/http";
import { z } from "zod";
import { createApiService } from "../../apps/fe-insta/src/lib/api/server/api-service";

const meta = { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" };
const schema = envelopeSchema(z.null(), commonErrorSchema);
const service = createApiService({ timeoutMs: 100, maxResponseBytes: 1024 });
test("API Result distinguishes status mismatch, malformed JSON, HTML, oversized body and no response", async () => {
  for (const [response, kind] of [
    [
      Response.json({ ok: true, data: null, meta }, { status: 500 }),
      "invalid_contract",
    ],
    [
      Response.json(
        {
          ok: false,
          error: { code: CommonErrorCode.InternalError, message: "safe" },
          meta,
        },
        { status: 200 },
      ),
      "invalid_contract",
    ],
    [
      new Response("{", { headers: { "content-type": "application/json" } }),
      "invalid_contract",
    ],
    [new Response("<html>502</html>", { status: 502 }), "invalid_contract"],
    [new Response("x".repeat(1025)), "invalid_contract"],
  ] as const) {
    const result = await service.request({
      execute: async () => response,
      outputSchema: schema,
      context: {},
    });
    expect(result.isError()).toBe(true);
    expect(errorOf(result).kind).toBe(kind);
  }
  const network = await service.request({
    execute: async () => {
      throw new TypeError("connection refused");
    },
    outputSchema: schema,
    context: {},
  });
  expect(errorOf(network)).toEqual({ kind: "network" });
});
test("success unwraps data and API failure preserves validated original correlation", async () => {
  const ok = await service.request({
    execute: async () => Response.json({ ok: true, data: null, meta }),
    outputSchema: schema,
    context: {},
  });
  if (!ok.isOk()) throw new Error("Expected success");
  expect(ok.get()).toBe(null);
  const failure = await service.request({
    execute: async () =>
      Response.json(
        {
          ok: false,
          error: { code: CommonErrorCode.InternalError, message: "safe" },
          meta,
        },
        { status: 500 },
      ),
    outputSchema: schema,
    context: {},
  });
  expect<unknown>(errorOf(failure)).toEqual({
    kind: "api",
    status: 500,
    error: { code: "INTERNAL_ERROR", message: "safe" },
    meta,
  });
});
test("chunked stream is cancelled at byte cap before JSON parse, and stalled body times out", async () => {
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1025));
    },
    cancel() {
      cancelled = true;
    },
  });
  const size = await service.request({
    execute: async () =>
      new Response(oversized, {
        headers: { "content-type": "application/json" },
      }),
    outputSchema: schema,
    context: {},
  });
  expect(errorOf(size).kind).toBe("invalid_contract");
  expect(cancelled).toBe(true);
  let timeoutCancelled = false;
  const stalled = new ReadableStream<Uint8Array>({
    cancel() {
      timeoutCancelled = true;
    },
  });
  const timeout = await createApiService({
    timeoutMs: 20,
    maxResponseBytes: 1024,
  }).request({
    execute: async () =>
      new Response(stalled, {
        headers: { "content-type": "application/json" },
      }),
    outputSchema: schema,
    context: {},
  });
  expect(errorOf(timeout).kind).toBe("network");
  expect(timeoutCancelled).toBe(true);
}, 1000);

const errorOf = <Data, Error>(result: Result<Data, Error>) => {
  if (!result.isError()) throw new Error("Expected error");
  return result.getError();
};
test("transport callback synchronous refusal produces network Result; rejected HTML stream is cancelled", async () => {
  const refused = await service.request({
    execute: () => {
      throw new TypeError("connection refused");
    },
    outputSchema: schema,
    context: {},
  });
  expect(errorOf(refused)).toEqual({ kind: "network" });
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const html = await service.request({
    execute: async () =>
      new Response(body, {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    outputSchema: schema,
    context: {},
  });
  expect(errorOf(html).kind).toBe("invalid_contract");
  expect(cancelled).toBe(true);
});
test("response byte limit accepts exactly1024 UTF8 bytes and rejects1025, independently of text code points", async () => {
  const outputSchema = envelopeSchema(z.string(), commonErrorSchema);
  const json = JSON.stringify({ ok: true, data: "😀".repeat(180), meta });
  const bytes = new TextEncoder().encode(json).byteLength;
  for (const [total, accepted] of [
    [1024, true],
    [1025, false],
  ] as const) {
    const body = json + " ".repeat(total - bytes);
    expect(new TextEncoder().encode(body).byteLength).toBe(total);
    const result = await service.request({
      execute: async () =>
        new Response(body, { headers: { "content-type": "application/json" } }),
      outputSchema,
      context: {},
    });
    expect(result.isOk()).toBe(accepted);
  }
});
