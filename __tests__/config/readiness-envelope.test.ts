import { expect, test } from "bun:test";
import { envelopeSchema } from "@insta/contracts/http";
import { z } from "zod";
import { GET } from "../../apps/fe-insta/src/routes/api/health/ready/+server";

const schema = envelopeSchema(
  z.strictObject({ status: z.literal("ok") }),
  z.strictObject({
    code: z.literal("DEPENDENCY_UNAVAILABLE"),
    message: z.string().min(1),
  }),
);
test.each([true, false])(
  "BFF readiness HTTP envelope and own correlation ready=%s",
  async (ready) => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) =>
        GET({
          request,
          locals: {
            stories: {
              feed: async () => new Response(),
              publish: async () => new Response(),
              publication: async () => new Response(),
              playback: async () => new Response(),
            },
            getSessionView: async () => {
              throw new Error("Readiness must not read session");
            },
            readPrivacy: async () => {
              throw new Error("Unexpected privacy read");
            },
            telemetrySource: async () => {
              throw new Error("Unexpected telemetry intake");
            },
            conversations: {
              list: async () => Response.json({}),
              history: async () => Response.json({}),
              start: async () => Response.json({}),
              acknowledgeReceipts: async () =>
                new Response(null, { status: 503 }),
              send: async () => new Response(null, { status: 503 }),
            },
            support: {
              context: async () => new Response(null, { status: 503 }),
              submit: async () => new Response(null, { status: 503 }),
            },
            auth: {
              directory: async () => Response.json({}),
              ticket: async () => new Response(null, { status: 503 }),
              registration: async () => new Response(null, { status: 503 }),
              login: async () => new Response(null, { status: 503 }),
              session: async () => new Response(null, { status: 503 }),
            },
            continuation: async () => new Response(null, { status: 409 }),
            checkReadiness: async () => ready,
            privacy: {
              choice: "necessary",
              policyVersion: 1,
              revision: 0,
            },
            savePrivacy: async () => new Response(null, { status: 403 }),
          },
        }),
    });
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch(server.url, {
        headers: { "X-Request-ID": requestId },
      });
      expect(response.status).toBe(ready ? 200 : 503);
      const body = schema.parse(await response.json());
      expect(body.meta.requestId).toBe(requestId);
      const generated = schema.parse(
        await (
          await fetch(server.url, { headers: { "X-Request-ID": "invalid" } })
        ).json(),
      );
      expect(generated.meta.requestId).not.toBe(requestId);
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      await server.stop(true);
    }
  },
);
