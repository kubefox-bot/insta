const fcpKey = "FCP";

import { expect, test } from "bun:test";
import { mixedFaroBody } from "../../fixtures/analytics/faro-batch";

test("Faro boundary erases error URLs query headers causes and unapproved meta before any export", async () => {
  const module = await import(
    "../../../apps/fe-insta/src/lib/observability/browser/sanitize-faro"
  ).catch(() => undefined);
  expect(module).toBeDefined();
  if (!module) return;
  const sanitized = module.sanitizeFaro({
    type: "exception",
    meta: {
      user: { email: "CANARY@example.test" },
      page: { url: "https://localhost/?token=CANARY" },
    },
    payload: {
      type: "Error",
      value: "CANARY",
      timestamp: "2026-10-09T00:00:00.000Z",
      stacktrace: {
        frames: [{ filename: "https://localhost/?password=CANARY" }],
      },
      cause: "CANARY",
      context: { authorization: "CANARY" },
    },
  });
  expect(sanitized).toMatchObject({
    meta: { app: { name: "fe-insta" } },
    exceptions: [{ type: "Error", value: "UNHANDLED_ERROR" }],
  });
  expect(JSON.stringify(sanitized)).not.toContain("CANARY");
  expect(
    module.sanitizeFaro({
      type: "log",
      meta: {},
      payload: { message: "CANARY" },
    }),
  ).toBeUndefined();
});
test("actual Faro JSON receiver probe differs from OTLP and accepts only currently allowed safe payloads", async () => {
  const { createFaroIntake, probeFaroReceiver } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/faro"
  );
  const receipts: unknown[] = [];
  const receiver = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      if (request.method === "OPTIONS")
        return Response.json({ protocol: "faro-json-v1" });
      receipts.push(await request.json());
      return new Response(null, { status: 202 });
    },
  });
  try {
    const endpoint = `http://127.0.0.1:${receiver.port}/collect`;
    expect(await probeFaroReceiver(endpoint)).toBe(true);
    const intake = createFaroIntake({ receiver: endpoint, clock: Date.now });
    const body = {
      meta: { app: { name: "fe-insta" } },
      measurements: [
        {
          type: "web-vitals",
          values: { [fcpKey]: 10 },
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const payload = {
      analyticsEventId: crypto.randomUUID(),
      revision: 1,
      policyVersion: 1,
      body,
    };
    const preference = {
      choice: "all" as const,
      revision: 1,
      policyVersion: 1,
    };
    expect(await intake({ payload, preference, source: "fixture" })).toBe(
      "accepted",
    );
    expect(receipts).toEqual([body]);
    expect(
      await intake({
        payload,
        preference: { ...preference, revision: 2 },
        source: "fixture",
      }),
    ).toBe("denied");
    expect(receipts).toHaveLength(1);
    expect(
      await intake({
        payload: {
          ...payload,
          body: { ...body, meta: { user: { email: "CANARY" } } },
        },
        preference,
        source: "fixture",
      }),
    ).toBe("invalid");
    expect(JSON.stringify(receipts)).not.toContain("CANARY");
  } finally {
    await receiver.stop(true);
  }
});
test("local optional receiver verifies actual Faro receipt and rejects Faro DTO at the OTLP endpoint", async () => {
  const { createTelemetryReceiver } = await import(
    "../../../infra/otel/receiver"
  );
  const receiver = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: createTelemetryReceiver(),
  });
  try {
    const root = `http://127.0.0.1:${receiver.port}`;
    const body = {
      meta: { app: { name: "fe-insta" } },
      exceptions: [
        {
          type: "Error",
          value: "UNHANDLED_ERROR",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    expect(
      (
        await fetch(`${root}/collect`, {
          method: "POST",
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${root}/v1/traces`, {
          method: "POST",
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
    expect(await (await fetch(`${root}/receipts`)).json()).toEqual({
      receipts: [{ protocol: "faro-json-v1", count: 1 }],
    });
  } finally {
    await receiver.stop(true);
  }
});

test("Faro intake enforces twenty total events across both arrays before actual receiver export", async () => {
  const { createFaroIntake } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/faro"
  );
  const { createTelemetryReceiver } = await import(
    "../../../infra/otel/receiver"
  );
  const receiver = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: createTelemetryReceiver(),
  });
  try {
    const endpoint = `http://127.0.0.1:${receiver.port}`;
    const intake = createFaroIntake({
      receiver: `${endpoint}/collect`,
      clock: Date.now,
    });
    const preference = {
      choice: "all" as const,
      revision: 1,
      policyVersion: 1,
    };
    for (const input of [
      { exceptions: 10, measurements: 10, want: "accepted" },
      { exceptions: 10, measurements: 11, want: "invalid" },
      { exceptions: 20, measurements: 20, want: "invalid" },
    ] as const) {
      expect(
        await intake({
          payload: {
            analyticsEventId: crypto.randomUUID(),
            revision: 1,
            policyVersion: 1,
            body: mixedFaroBody(input),
          },
          preference,
          source: "owned-mixed-faro",
        }),
      ).toBe(input.want);
    }
    expect(await (await fetch(`${endpoint}/receipts`)).json()).toEqual({
      receipts: [{ protocol: "faro-json-v1", count: 20 }],
    });
  } finally {
    await receiver.stop(true);
  }
});

test("actual local Faro receiver rejects a mixed twenty-one-event body and retains the twenty-event receipt", async () => {
  const { createTelemetryReceiver } = await import(
    "../../../infra/otel/receiver"
  );
  const receiver = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: createTelemetryReceiver(),
  });
  try {
    const root = `http://127.0.0.1:${receiver.port}`;
    for (const input of [
      { exceptions: 10, measurements: 10, want: 200 },
      { exceptions: 10, measurements: 11, want: 400 },
    ]) {
      const response = await fetch(`${root}/collect`, {
        method: "POST",
        body: JSON.stringify(mixedFaroBody(input)),
      });
      expect(response.status).toBe(input.want);
      await response.body?.cancel();
    }
    expect(await (await fetch(`${root}/receipts`)).json()).toEqual({
      receipts: [{ protocol: "faro-json-v1", count: 20 }],
    });
  } finally {
    await receiver.stop(true);
  }
});
