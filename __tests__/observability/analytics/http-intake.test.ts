import { expect, test } from "bun:test";
import {
  probeHttpQuota,
  quotaClientBody,
} from "../../fixtures/analytics/http-quota";

test("HTTP admission counts malformed, wrong-type and oversized bodies once across both routes; another source stays independent", async () => {
  const { createHttpIntake } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/http-intake"
  );
  const { createIntakeAdmission } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/intake"
  );
  const emitted: unknown[] = [];
  const receive = createHttpIntake({
    admission: createIntakeAdmission(() => 1),
    receiver: undefined,
    emit: (event) => emitted.push(event),
  });
  const preference = { choice: "all" as const, revision: 1, policyVersion: 1 };
  const send = async ({
    path,
    body,
    contentType,
  }: Readonly<{ path: string; body: string; contentType: string }>) =>
    (
      await receive({
        request: new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
        }),
        readPreference: async () => preference,
        source: "server-peer-a",
        protocol: path.endsWith("/faro") ? "faro" : "client",
      })
    ).status;
  const outcome = await probeHttpQuota(send);
  expect(outcome.rejected.slice(0, 40)).toEqual(Array(40).fill(400));
  expect(outcome.rejected.slice(40)).toEqual(Array(19).fill(413));
  expect(outcome.sixty).toBe(204);
  expect(outcome.sixtyOne).toBe(429);
  expect(outcome.sixtyTwo).toBe(429);
  const other = await receive({
    request: new Request("http://localhost/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: quotaClientBody(),
    }),
    readPreference: async () => preference,
    source: "server-peer-b",
    protocol: "client",
  });
  expect(other.status).toBe(204);
  expect(emitted).toHaveLength(2);
});

test("exhausted HTTP admission cancels an unread body without waiting for provider cleanup", async () => {
  const { createHttpIntake } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/http-intake"
  );
  const { createIntakeAdmission } = await import(
    "../../../apps/fe-insta/src/lib/observability/server/intake"
  );
  const admission = createIntakeAdmission(() => 1);
  for (let index = 0; index < 60; index++) admission.admit("server-peer");
  const calls = { pull: 0, canceled: false };
  const receive = createHttpIntake({
    admission,
    receiver: undefined,
    emit: () => {
      throw new Error("Unexpected emission");
    },
  });
  const body = new ReadableStream(
    {
      pull() {
        calls.pull++;
      },
      cancel() {
        calls.canceled = true;
        return new Promise<void>(() => {});
      },
    },
    { highWaterMark: 0 },
  );
  const response = await receive({
    request: new Request("http://localhost/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    readPreference: async () => ({
      choice: "necessary",
      revision: 0,
      policyVersion: 1,
    }),
    source: "server-peer",
    protocol: "client",
  });
  expect(response.status).toBe(429);
  expect(calls.pull).toBe(0);
  expect(calls.canceled).toBe(true);
}, 1000);
