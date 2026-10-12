import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { dispatchCanonicalClaim } from "../../../apps/be-insta/src/lib/observability/analytics/dispatch-claim";
import type { AnalyticsClaim } from "../../../apps/be-insta/src/lib/observability/analytics/types";

// The missing capability is asserted as an outcome so RED describes the absent dispatcher.
const load = async () =>
  import(
    "../../../packages/fe-core/src/observability/analytics/decide-goal"
  ).catch(() => undefined);
test("a committed server effect records once by event identity and denies a stale reference", async () => {
  const module = await load();
  expect(module).toBeDefined();
  if (!module) return;
  const delivered: string[] = [];
  const claims = new Set<string>();
  const input = {
    record: {
      analyticsEventId: "10000000-0000-4000-8000-000000000001",
      effectId: "effect-one",
      operationId: "10000000-0000-4000-8000-000000000002",
      operation: "test.commit",
      code: "SAVED",
      authority: "server_canonical" as const,
      occurredAt: 1000,
      reference: {
        contextId: "test",
        revision: 1,
        policyVersion: 1,
        generation: "test",
      },
    },
    mapping: {
      operation: "test.commit",
      successCodes: ["SAVED"],
      authority: "server_canonical" as const,
      goal: "test_saved",
    },
    permission: async () => "allowed" as const,
    sink: {
      name: "log_only",
      record: async (event: { analyticsEventId: string }) => {
        delivered.push(event.analyticsEventId);
        return Result.Ok("recorded" as const);
      },
    },
    claims: {
      has: async (key: string) => claims.has(key),
      save: async (key: string) => {
        claims.add(key);
      },
    },
  };
  const first = await module.dispatchGoal(input);
  const second = await module.dispatchGoal(input);
  expect(first.isOk() && first.get()).toBe("recorded");
  expect(second.isOk() && second.get()).toBe("duplicate");
  expect(delivered).toEqual(["10000000-0000-4000-8000-000000000001"]);
  const denied = await module.dispatchGoal({
    ...input,
    record: {
      ...input.record,
      analyticsEventId: "10000000-0000-4000-8000-000000000003",
    },
    permission: async () => "denied" as const,
  });
  expect(denied.isOk() && denied.get()).toBe("no_goal");
  expect(delivered).toHaveLength(1);
});
test("client authority and internal operations cannot claim server conversions", async () => {
  const module = await load();
  expect(module).toBeDefined();
  if (!module) return;
  const record = {
    analyticsEventId: crypto.randomUUID(),
    effectId: "effect",
    operationId: crypto.randomUUID(),
    operation: "internal.refresh",
    code: "SAVED",
    authority: "client_observed" as const,
    occurredAt: 1,
  };
  const result = await module.dispatchGoal({
    record,
    mapping: {
      operation: "internal.refresh",
      successCodes: ["SAVED"],
      authority: "server_canonical",
      goal: "bad_goal",
    },
    permission: async () => "allowed",
    sink: {
      name: "log_only",
      record: async () => {
        throw new Error("must not export");
      },
    },
  });
  expect(result.isOk() && result.get()).toBe("no_goal");
});

test("canonical delivery settles dispatch before finishing or retrying the persisted claim", async () => {
  const claim: AnalyticsClaim = {
    id: "synthetic",
    sink: "log_only",
    leaseId: "owned-lease",
    record: {
      analyticsEventId: "10000000-0000-4000-8000-000000000001",
      effectId: "synthetic",
      operationId: "10000000-0000-4000-8000-000000000002",
      operation: "test.commit",
      code: "SAVED",
      authority: "server_canonical",
      occurredAt: 1,
      reference: {
        contextId: "synthetic",
        revision: 1,
        policyVersion: 1,
        generation: "synthetic",
      },
    },
    mapping: {
      operation: "test.commit",
      successCodes: ["SAVED"],
      authority: "server_canonical",
      goal: "test_saved",
    },
  };
  for (const [permission, outcome, expected] of [
    ["allowed", "recorded", ["permission", "sink", "delivered"]],
    ["allowed", "duplicate", ["permission", "sink", "delivered"]],
    ["denied", "recorded", ["permission", "denied"]],
    ["unavailable", "recorded", ["permission", "retry"]],
  ] as const) {
    const operations: string[] = [];
    const result = await dispatchCanonicalClaim({
      claim,
      permission: async () => {
        operations.push("permission");
        return permission;
      },
      sink: {
        name: "log_only",
        record: async () => {
          operations.push("sink");
          return Result.Ok(outcome);
        },
      },
      outbox: {
        claim: async () => null,
        finish: async ({ claim: finished, state, now }) => {
          expect(finished).toBe(claim);
          expect(now).toBe(42);
          operations.push(state);
          return true;
        },
        retry: async ({ claim: retained, now }) => {
          expect(retained).toBe(claim);
          expect(now).toBe(42);
          operations.push("retry");
        },
      },
      clock: () => 42,
    });
    expect(operations).toEqual([...expected]);
    expect(result).toBe(permission === "unavailable" ? "retry" : "completed");
  }
});
