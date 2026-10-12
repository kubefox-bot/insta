import { expect, test } from "bun:test";
import type { PublicPreference } from "@insta/contracts/privacy";
import { createHttpIntake } from "../../../apps/fe-insta/src/lib/observability/server/http-intake";
import { createIntakeAdmission } from "../../../apps/fe-insta/src/lib/observability/server/intake";
import { quotaClientBody } from "../../fixtures/analytics/http-quota";

for (const protocol of ["client", "faro"] as const) {
  test(`${protocol} intake rereads canonical permission after held body, before optional effect`, async () => {
    const effects: unknown[] = [];
    const receiver = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        effects.push("receiver");
        return new Response(null, { status: 202 });
      },
    });
    const preference: PublicPreference = {
      choice: "all",
      revision: 1,
      policyVersion: 1,
    };
    let current = preference;
    const pulled = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const body =
      protocol === "client"
        ? quotaClientBody()
        : JSON.stringify({
            analyticsEventId: crypto.randomUUID(),
            revision: 1,
            policyVersion: 1,
            body: {
              meta: { app: { name: "fe-insta" } },
              exceptions: [
                {
                  type: "Error",
                  value: "UNHANDLED_ERROR",
                  timestamp: new Date().toISOString(),
                },
              ],
            },
          });
    const receive = createHttpIntake({
      admission: createIntakeAdmission(Date.now),
      emit: (event) => effects.push(event),
      receiver: receiver.url.toString(),
    });
    const request = new Request("http://localhost/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream(
        {
          async pull(controller) {
            pulled.resolve();
            await release.promise;
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        },
        { highWaterMark: 0 },
      ),
    });
    try {
      const pending = receive({
        request,
        readPreference: async () => current,
        source: "owned-peer",
        protocol,
      });
      await pulled.promise;
      current = { choice: "necessary", revision: 2, policyVersion: 1 };
      release.resolve();
      expect((await pending).status).toBe(403);
      expect(effects).toEqual([]);
    } finally {
      release.resolve();
      await receiver.stop(true);
    }
  });
}

test.each([
  { choice: "all", revision: 1, expected: 204 },
  { choice: "necessary", revision: 1, expected: 403 },
  { choice: "all", revision: 2, expected: 403 },
  { choice: "unavailable", revision: 1, expected: 403 },
] as const)(
  "fresh intake permission $choice revision $revision stays authoritative",
  async ({ choice, revision, expected }) => {
    const effects: unknown[] = [];
    const receive = createHttpIntake({
      admission: createIntakeAdmission(Date.now),
      receiver: undefined,
      emit: (event) => effects.push(event),
    });
    const response = await receive({
      request: new Request("http://localhost/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: quotaClientBody(),
      }),
      source: "peer",
      protocol: "client",
      readPreference: async () => {
        if (choice === "unavailable")
          throw new Error("private provider failure");
        return { choice, revision, policyVersion: 1 };
      },
    });
    expect(response.status).toBe(expected);
    expect(effects.length).toBe(expected === 204 ? 1 : 0);
  },
);
