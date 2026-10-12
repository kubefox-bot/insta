import { expect, test } from "bun:test";
import { createLogOnlySink } from "@insta/fe-core/observability/analytics";
import { logFields } from "@insta/fe-core/observability/contracts";
import { createPinoAdapter } from "@insta/fe-core/observability/server";

test("real Pino whitelist retains narrow canonical log-only projection and erases extra content", async () => {
  const lines: string[] = [];
  const adapter = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "be-insta",
      source: "server",
    },
    destination: {
      write: (line: string) => {
        lines.push(line);
      },
    },
  });
  try {
    const sink = createLogOnlySink({
      emit: (record) =>
        adapter.logger.info({ ...record, raw: "CANARY", exception: "CANARY" }),
    });
    const event = {
      analyticsEventId: crypto.randomUUID(),
      effectId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      operation: "test.commit",
      code: "SAVED",
      authority: "server_canonical" as const,
      occurredAt: Date.now(),
      goal: "test_saved",
    };
    expect((await sink.record(event)).isOk()).toBe(true);
    const record = JSON.parse(lines[0] ?? "{}");
    expect(record.event_type).toBe("analytics");
    expect(record.analytics).toEqual(event);
    expect(JSON.stringify(lines)).not.toContain("CANARY");
  } finally {
    await adapter.close();
  }
});
test("real Pino never upgrades client authority or copies arbitrary client goal payload", async () => {
  const lines: string[] = [];
  const adapter = createPinoAdapter({
    identity: {
      app: "insta",
      [logFields.serviceName]: "fe-insta",
      source: "server",
    },
    destination: {
      write: (line: string) => {
        lines.push(line);
      },
    },
  });
  try {
    const event = {
      analyticsEventId: crypto.randomUUID(),
      operation: "frontend.error",
      code: "UNHANDLED_ERROR",
      authority: "client_observed",
    };
    adapter.logger.info({
      [logFields.eventType]: "client_observed",
      client: { ...event, goal: "CANARY", raw: "CANARY" },
    });
    expect(JSON.parse(lines[0] ?? "{}").client).toEqual(event);
    adapter.logger.info({
      [logFields.eventType]: "client_observed",
      client: { ...event, authority: "server_canonical" },
    });
    expect(JSON.parse(lines[1] ?? "{}").client).toBeUndefined();
    expect(JSON.stringify(lines)).not.toContain("CANARY");
  } finally {
    await adapter.close();
  }
});
