import { expect, test } from "bun:test";
import { inspectRequestLimits } from "../../apps/fe-insta/src/lib/http/server/index";

test("a declared owning body limit prevents generic clone/read while preserving headers", async () => {
  const request = new Request("http://localhost/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: " ".repeat(65537),
  });
  const calls = { clone: 0 };
  const originalClone = request.clone.bind(request);
  Object.defineProperty(request, "clone", {
    value: () => {
      calls.clone++;
      return originalClone();
    },
  });
  expect(
    await inspectRequestLimits(request, { mode: "headers_only" }),
  ).toBeNull();
  expect(calls.clone).toBe(0);
  const oversizedHeaders = new Request("http://localhost/api/telemetry", {
    method: "POST",
    headers: { "x-fixture": "x".repeat(16385) },
    body: "{ }",
  });
  expect(
    await inspectRequestLimits(oversizedHeaders, { mode: "headers_only" }),
  ).toBe("headers");
});

test("only exact telemetry POST routes use their body owner; near misses and other methods retain generic limits", async () => {
  const { inspectRequestForRoute } = await import(
    "../../apps/fe-insta/src/app/http/server/limits/index"
  );
  for (const input of [
    { method: "POST", routeId: "/api/telemetry", want: null },
    { method: "POST", routeId: "/api/telemetry/faro", want: null },
    { method: "PUT", routeId: "/api/telemetry", want: "json" },
    { method: "POST", routeId: "/api/telemetry/other", want: "json" },
    { method: "POST", routeId: "/api/telemetry/faro-extra", want: "json" },
    { method: "POST", routeId: null, want: "json" },
  ] as const) {
    const request = new Request("http://localhost/probe", {
      method: input.method,
      headers: { "Content-Type": "application/json" },
      body: " ".repeat(65537),
    });
    expect(
      await inspectRequestForRoute({ request, route: { id: input.routeId } }),
    ).toBe(input.want);
  }
});

test("BFF rejects oversized chunked JSON without relying on Content-Length and preserves valid body", async () => {
  const oversize = new Request("https://localhost/api/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(65537)));
        controller.close();
      },
    }),
  });
  expect(await inspectRequestLimits(oversize)).toBe("json");
  const valid = new Request("https://localhost/api/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"ok":true}',
  });
  expect(await inspectRequestLimits(valid)).toBeNull();
  expect(await valid.json()).toEqual({ ok: true });
  expect(
    await inspectRequestLimits(
      new Request("https://localhost", {
        headers: { "X-Large": "x".repeat(16385) },
      }),
    ),
  ).toBe("headers");
});

test("JSON media type is case insensitive and parameters do not bypass 64 KiB", async () => {
  for (const contentType of [
    "Application/JSON",
    "APPLICATION/json ; charset=utf-8",
  ]) {
    const body = JSON.stringify("x".repeat(65535));
    expect(new TextEncoder().encode(body).byteLength).toBe(65537);
    expect(
      await inspectRequestLimits(
        new Request("https://localhost/api/probe", {
          method: "POST",
          headers: { "content-type": contentType },
          body,
        }),
      ),
    ).toBe("json");
  }
});
