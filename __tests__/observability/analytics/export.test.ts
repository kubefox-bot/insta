import { expect, test } from "bun:test";
import { createTracing } from "@insta/fe-core/observability/server";
import { waitUntil } from "../../fixtures/barrier";

test("concrete optional OTLP sink abort settles owned fetch and permits later delivery after cleanup", async () => {
  const module = await import(
    "../../../apps/be-insta/src/lib/observability/analytics/otel"
  ).catch(() => undefined);
  expect(module).toBeDefined();
  if (!module) return;
  const receipt: unknown[] = [];
  const held: { resolve?: (response: Response) => void } = {};
  const tracing = createTracing();
  const traceEffect = (
    event: Readonly<{ operation: string; occurredAt: number }>,
  ) =>
    tracing.effectContext({
      permission: "allowed",
      name: event.operation,
      occurredAt: event.occurredAt,
    });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const body = await request.json();
      receipt.push(body);
      if (new URL(request.url).pathname === "/held")
        return new Promise<Response>((resolve) => {
          held.resolve = resolve;
        });
      return Response.json({});
    },
  });
  try {
    const event = {
      analyticsEventId: crypto.randomUUID(),
      effectId: "synthetic",
      operationId: crypto.randomUUID(),
      operation: "test.commit",
      code: "SAVED",
      authority: "server_canonical" as const,
      occurredAt: Date.now(),
      goal: "test_saved",
    };
    const controller = new AbortController();
    const sink = module.createOtlpSink({
      traceEffect,
      endpoint: `http://127.0.0.1:${server.port}/held`,
    });
    const pending = sink.record(event, controller.signal);
    await waitUntil({
      timeoutMs: 2000,
      check: async () => held.resolve !== undefined,
    });
    controller.abort();
    expect((await pending).isError()).toBe(true);
    await sink.close();
    held.resolve?.(Response.json({}));
    const delivered = module.createOtlpSink({
      traceEffect,
      endpoint: `http://127.0.0.1:${server.port}/v1/traces`,
    });
    expect((await delivered.record(event)).isOk()).toBe(true);
    await delivered.close();
    expect(receipt.at(-1)).toMatchObject({
      resourceSpans: [{ scopeSpans: [{ spans: [{ name: "test.commit" }] }] }],
    });
    expect(JSON.stringify(receipt)).not.toContain("contextId");
  } finally {
    await tracing.close();
    held.resolve?.(Response.json({}));
    await server.stop(true);
  }
});
