import { expect, test } from "bun:test";
import { Writable } from "node:stream";
import { logFields } from "@insta/fe-core/observability/contracts";
import {
  createPinoAdapter,
  createTracing,
  readContext,
} from "@insta/fe-core/observability/server";
import { createCommandObserver } from "../../../src/lib/realtime/index";

test("command observer owns real OTel spans and fresh ALS contexts without logging payload", async () => {
  const logs: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  const adapter = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    destination,
  });
  const tracing = createTracing({ readPermission: () => "allowed" });
  const observability = {
    adapter,
    tracing,
    close: async () => {
      await tracing.close();
      await adapter.close();
    },
  };
  const observe = createCommandObserver({
    observability,
    uuid: () => crypto.randomUUID(),
  });
  try {
    const first = await observe({
      type: "conversations.subscribe",
      classify: () => ({ code: "OK", outcome: "succeeded" }),
      execute: async (meta) => {
        expect(readContext()?.requestId).toBe(meta.requestId);
        return readContext();
      },
    });
    const second = await observe({
      type: "conversations.subscribe",
      classify: () => ({ code: "OK", outcome: "succeeded" }),
      execute: async () => readContext(),
    });
    expect(first?.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(second?.spanId).not.toBe(first?.spanId);
    expect(second?.requestId).not.toBe(first?.requestId);
    expect(readContext()).toBeUndefined();
    expect(logs).toHaveLength(2);
    expect(logs.join("")).not.toContain("ticket");
  } finally {
    await observability.close();
  }
});

for (const scenario of [
  { code: "OK", outcome: "succeeded" },
  { code: "FORBIDDEN", outcome: "rejected" },
  { code: "RATE_LIMITED", outcome: "rejected" },
  { code: "SERVICE_UNAVAILABLE", outcome: "failed" },
  { code: "UNSUPPORTED_COMMAND", outcome: "rejected" },
] as const) {
  test(`terminal observer preserves ${scenario.code} result and real sink fields`, async () => {
    const logs: string[] = [];
    const adapter = createPinoAdapter({
      identity: {
        app: "insta",
        [logFields.serviceName]: "be-insta",
        source: "server",
      },
      destination: new Writable({
        write(chunk, _encoding, callback) {
          logs.push(chunk.toString());
          callback();
        },
      }),
    });
    const tracing = createTracing();
    const ticks = [10, 27];
    const observe = createCommandObserver({
      uuid: () => crypto.randomUUID(),
      clock: () => ticks.shift() ?? 27,
      observability: { adapter, tracing, close: async () => {} },
    });
    const result = { payload: "CANARY_PRIVATE_MESSAGE", ...scenario };
    const operationId = crypto.randomUUID();
    try {
      expect(
        await observe({
          type: "conversations.subscribe",
          operationId,
          classify: (value) => ({ code: value.code, outcome: value.outcome }),
          execute: async () => result,
        }),
      ).toBe(result);
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({
        [logFields.eventType]: "business_operation",
        [logFields.operationId]: operationId,
        business: {
          operation: "conversations.subscribe",
          ...scenario,
          [logFields.durationMs]: 17,
          authority: "server_canonical",
        },
      });
      expect(JSON.parse(logs[0] ?? "{}").http).toBeUndefined();
      expect(logs.join("")).not.toContain("CANARY");
      expect(readContext()).toBeUndefined();
    } finally {
      await tracing.close();
      await adapter.close();
    }
  });
}

test("thrown execution keeps error identity and emits sanitized failure", async () => {
  const logs: string[] = [];
  const adapter = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    destination: new Writable({
      write(chunk, _encoding, callback) {
        logs.push(chunk.toString());
        callback();
      },
    }),
  });
  const tracing = createTracing({ readPermission: () => "allowed" });
  const ticks = [100, 125];
  const observe = createCommandObserver({
    uuid: () => crypto.randomUUID(),
    clock: () => ticks.shift() ?? 125,
    observability: { adapter, tracing, close: async () => {} },
  });
  const original = new Error("CANARY_SECRET_ERROR");
  try {
    await expect(
      observe({
        type: "conversations.subscribe",
        classify: () => ({ code: "OK", outcome: "succeeded" }),
        execute: async () => {
          throw original;
        },
      }),
    ).rejects.toBe(original);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({
      business: {
        code: "WS_COMMAND_FAILED",
        outcome: "failed",
        [logFields.durationMs]: 25,
      },
    });
    expect(logs.join("")).not.toContain("CANARY");
    expect(readContext()).toBeUndefined();
  } finally {
    await tracing.close();
    await adapter.close();
  }
});

for (const throws of [false, true]) {
  test(`throwing logging sink preserves ${throws ? "error" : "result"} and clears context`, async () => {
    const adapter = createPinoAdapter({
      identity: {
        app: "insta",
        [logFields.serviceName]: "be-insta",
        source: "server",
      },
      destination: new Writable({
        write() {
          throw new Error("sink failed");
        },
      }),
    });
    const tracing = createTracing({ readPermission: () => "allowed" });
    const observe = createCommandObserver({
      uuid: () => crypto.randomUUID(),
      observability: { adapter, tracing, close: async () => {} },
    });
    const original = new Error("original");
    const result = { accepted: true };
    try {
      const pending = observe({
        type: "conversations.subscribe",
        classify: () => ({ code: "OK", outcome: "succeeded" }),
        execute: async () => {
          if (throws) throw original;
          return result;
        },
      });
      if (throws) await expect(pending).rejects.toBe(original);
      else expect(await pending).toBe(result);
      expect(readContext()).toBeUndefined();
    } finally {
      await tracing.close();
      await adapter.close();
    }
  });
}

test("classifier failure preserves the original result and emits one safe terminal failure", async () => {
  const logs: string[] = [];
  const adapter = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    destination: new Writable({
      write(chunk, _encoding, callback) {
        logs.push(chunk.toString());
        callback();
      },
    }),
  });
  const tracing = createTracing();
  const observe = createCommandObserver({
    uuid: () => crypto.randomUUID(),
    clock: () => 0,
    observability: { adapter, tracing, close: async () => {} },
  });
  const original = { payload: "CANARY_CLASSIFIER" };
  try {
    expect(
      await observe({
        type: "conversations.subscribe",
        classify: () => {
          throw new Error("CANARY_CLASSIFIER");
        },
        execute: async () => original,
      }),
    ).toBe(original);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0] ?? "{}").business).toMatchObject({
      outcome: "failed",
      code: "WS_COMMAND_FAILED",
      [logFields.durationMs]: 0,
    });
    expect(logs.join("")).not.toContain("CANARY");
    expect(readContext()).toBeUndefined();
  } finally {
    await tracing.close();
    await adapter.close();
  }
});
