import { expect, test } from "bun:test";
import { logFields } from "../../src/observability/contracts/conts";
import { createPinoAdapter } from "../../src/observability/server/index";

test("actual Pino output preserves trusted canonical safe correlation and UUID compatibility, while rejecting unsafe projections", async () => {
  const lines: string[] = [];
  const adapter = createPinoAdapter({
    identity: {
      app: "fixture",
      [logFields.serviceName]: "fixture",
      source: "server",
    },
    destination: {
      write: (line) => {
        lines.push(line);
      },
    },
  });
  const projection = {
    analyticsEventId: crypto.randomUUID(),
    effectId: crypto.randomUUID(),
    operation: "asset.publish",
    code: "PUBLISHED",
    authority: "server_canonical",
    occurredAt: 1,
    goal: "asset_published",
    media: "CANARY_CONTENT",
    url: "https://private.test/?signed=CANARY_TOKEN",
  };
  const valid = ["operation_1", "x".repeat(128), crypto.randomUUID()];
  const invalid = [
    "",
    "x".repeat(129),
    "unsafe\nvalue",
    "https://private.test",
    "secret=value",
  ];
  for (const operationId of [...valid, ...invalid])
    adapter.logger.info({
      [logFields.eventType]: "analytics",
      analytics: { ...projection, operationId },
    });
  await adapter.close();
  const records = lines.map((line) => JSON.parse(line));
  expect(
    records
      .slice(0, valid.length)
      .map((record) => record.analytics?.operationId),
  ).toEqual(valid);
  for (const record of records.slice(valid.length))
    expect(record.analytics).toBeUndefined();
  for (const canary of ["CANARY_CONTENT", "CANARY_TOKEN", "https://"])
    expect(lines.join("")).not.toContain(canary);
});

test("client goals come only from a trusted resolver after field and authority validation", async () => {
  const lines: string[] = [];
  const resolved: unknown[] = [];
  const adapter = createPinoAdapter({
    identity: {
      app: "fixture",
      [logFields.serviceName]: "fixture",
      source: "server",
    },
    destination: {
      write: (line) => {
        lines.push(line);
      },
    },
    resolveClientGoal: (event) => {
      resolved.push(event);
      return event.code === "PLAYING"
        ? "owned_goal"
        : "https://private/?token=CANARY";
    },
  });
  const event = {
    analyticsEventId: crypto.randomUUID(),
    operation: "asset.play",
    code: "PLAYING",
    authority: "client_observed",
    goal: "forged_safe_goal",
    token: "CANARY_TOKEN",
  };
  adapter.logger.info({
    [logFields.eventType]: "client_observed",
    client: event,
  });
  adapter.logger.info({
    [logFields.eventType]: "client_observed",
    client: { ...event, code: "INVALID" },
  });
  adapter.logger.info({
    [logFields.eventType]: "client_observed",
    client: { ...event, authority: "server_canonical" },
  });
  await adapter.close();
  const records = lines.map((line) => JSON.parse(line));
  expect(resolved).toEqual([
    {
      analyticsEventId: event.analyticsEventId,
      operation: event.operation,
      code: "PLAYING",
      authority: "client_observed",
    },
    {
      analyticsEventId: event.analyticsEventId,
      operation: event.operation,
      code: "INVALID",
      authority: "client_observed",
    },
  ]);
  expect(records[0].client.goal).toBe("owned_goal");
  expect(records[1].client.goal).toBeUndefined();
  expect(records[2].client).toBeUndefined();
  for (const forbidden of ["forged_safe_goal", "CANARY", "https://"])
    expect(lines.join("")).not.toContain(forbidden);
});
