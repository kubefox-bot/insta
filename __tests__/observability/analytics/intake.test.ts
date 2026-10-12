import { expect, test } from "bun:test";
import { consentPolicyVersion } from "@insta/contracts/privacy";

const load = async () =>
  import("../../../apps/fe-insta/src/lib/observability/server/intake").catch(
    () => undefined,
  );
test("A23 intake overrides malicious authority and strips arbitrary text before emission", async () => {
  const module = await load();
  expect(module).toBeDefined();
  if (!module) return;
  const emitted: unknown[] = [];
  const intake = module.createClientIntake({
    clock: () => 1,
    emit: (event) => emitted.push(event),
  });
  const preference = {
    choice: "all" as const,
    policyVersion: consentPolicyVersion,
    revision: 1,
  };
  const payload = {
    revision: 1,
    policyVersion: consentPolicyVersion,
    events: [
      {
        analyticsEventId: crypto.randomUUID(),
        operation: "frontend.error",
        code: "UNHANDLED_ERROR",
        authority: "server_canonical",
        goal: "registration_completed",
        text: "CANARY_SECRET_PASSWORD_EMAIL",
      },
    ],
  };
  const result = await intake({
    payload,
    preference,
    source: "server-derived",
  });
  expect(result).toBe("accepted");
  expect(emitted).toHaveLength(1);
  expect(emitted[0]).toMatchObject({
    authority: "client_observed",
    operation: "frontend.error",
    code: "UNHANDLED_ERROR",
  });
  expect(JSON.stringify(emitted)).not.toContain("CANARY");
  expect(JSON.stringify(emitted)).not.toContain("registration_completed");
});
test("A24 intake denied revisions never backfill, and source quota uses server identity", async () => {
  const module = await load();
  expect(module).toBeDefined();
  if (!module) return;
  const emitted: unknown[] = [];
  const intake = module.createClientIntake({
    clock: () => 1,
    emit: (event) => emitted.push(event),
  });
  const preference = {
    choice: "all" as const,
    policyVersion: consentPolicyVersion,
    revision: 2,
  };
  const payload = {
    revision: 1,
    policyVersion: consentPolicyVersion,
    events: [
      {
        analyticsEventId: crypto.randomUUID(),
        operation: "frontend.error",
        code: "UNHANDLED_ERROR",
      },
    ],
  };
  expect(await intake({ payload, preference, source: "peer" })).toBe("denied");
  expect(emitted).toHaveLength(0);
  const allowed = { ...payload, revision: 2 };
  for (let index = 0; index < 59; index += 1)
    expect(await intake({ payload: allowed, preference, source: "peer" })).toBe(
      "accepted",
    );
  expect(await intake({ payload: allowed, preference, source: "peer" })).toBe(
    "rate_limited",
  );
  expect(
    await intake({ payload: allowed, preference, source: "other-peer" }),
  ).toBe("accepted");
  expect(emitted).toHaveLength(1);
});
test("intake rejects server-only operations and batches larger than twenty", async () => {
  const module = await load();
  expect(module).toBeDefined();
  if (!module) return;
  const intake = module.createClientIntake({
    clock: () => 1,
    emit: () => {
      throw new Error("unsafe emission");
    },
  });
  const preference = {
    choice: "all" as const,
    policyVersion: consentPolicyVersion,
    revision: 1,
  };
  const event = {
    analyticsEventId: crypto.randomUUID(),
    operation: "auth.login",
    code: "SESSION_CREATED",
  };
  expect(
    await intake({
      payload: {
        revision: 1,
        policyVersion: consentPolicyVersion,
        events: [event],
      },
      preference,
      source: "peer",
    }),
  ).toBe("invalid");
  expect(
    await intake({
      payload: {
        revision: 1,
        policyVersion: consentPolicyVersion,
        events: Array.from({ length: 21 }, () => ({
          ...event,
          operation: "frontend.error",
          code: "UNHANDLED_ERROR",
        })),
      },
      preference,
      source: "peer",
    }),
  ).toBe("invalid");
});
test("client and Faro BFF routes share the sixty requests per server source budget", async () => {
  const { createClientIntake, createIntakeAdmission } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/intake"
  );
  const { createFaroIntake } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/faro"
  );
  const admission = createIntakeAdmission(() => 1);
  const client = createClientIntake({
    clock: () => 1,
    emit: () => {},
    admission,
  });
  const faro = createFaroIntake({
    clock: () => 1,
    receiver: undefined,
    admission,
  });
  const preference = {
    choice: "necessary" as const,
    revision: 0,
    policyVersion: 1,
  };
  for (let index = 0; index < 30; index += 1) {
    expect(
      await client({ payload: {}, preference, source: "trusted-peer" }),
    ).toBe("invalid");
    expect(
      await faro({ payload: {}, preference, source: "trusted-peer" }),
    ).toBe("invalid");
  }
  expect(
    await client({ payload: {}, preference, source: "trusted-peer" }),
  ).toBe("rate_limited");
});
test("best-effort client claim cache expires at twenty-four hours and evicts beyond two hundred fifty-six IDs", async () => {
  const { createClientClaims } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/claims"
  );
  const time = { now: 0 };
  const duplicate = createClientClaims(() => time.now);
  const first = crypto.randomUUID();
  expect(duplicate(first)).toBe(false);
  expect(duplicate(first)).toBe(true);
  for (let index = 0; index < 256; index += 1)
    expect(duplicate(crypto.randomUUID())).toBe(false);
  expect(duplicate(first)).toBe(false);
  const last = crypto.randomUUID();
  expect(duplicate(last)).toBe(false);
  time.now = 86400000;
  expect(duplicate(last)).toBe(false);
});
test("chunked native request body exceeding sixteen KiB is canceled and never decoded", async () => {
  const { readIntakePayload } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/payload"
  );
  const small = new Request("http://localhost/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valid: true }),
  });
  expect(await readIntakePayload(small)).toEqual({
    kind: "parsed",
    payload: { valid: true },
  });
  const canceled = { value: false };
  const large = new Request("http://localhost/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(" ".repeat(16385)));
      },
      cancel() {
        canceled.value = true;
      },
    }),
  });
  expect(await readIntakePayload(large)).toEqual({ kind: "too_large" });
  expect(canceled.value).toBe(true);
});
