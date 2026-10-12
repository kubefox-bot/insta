import { expect, test } from "bun:test";
import { z } from "zod";
import { decodeReadResponse } from "../../../apps/fe-insta/src/domains/conversations/server/adapters/lib/decode-read";
import { decodeBackendSend } from "../../../apps/fe-insta/src/domains/conversations/server/adapters/lib/decode-send";
import { decodeReceiptResponse } from "../../../apps/fe-insta/src/domains/conversations/server/receipts/adapters/decode";
import { executeAuthorized } from "../../../apps/fe-insta/src/lib/session/server/use-cases/execute-authorized";
import { sessionFixture } from "../../fixtures/chat05/session";

const decoders = {
  read: (response: Response, raw: unknown) =>
    decodeReadResponse({ response, raw, schema: z.unknown() }),
  send: (response: Response, raw: unknown) =>
    decodeBackendSend({ response, raw }),
  receipt: (response: Response, raw: unknown) =>
    decodeReceiptResponse({
      response,
      raw,
      conversationId: "a".repeat(24),
      messageIds: ["b".repeat(24)],
    }),
};
const fallback = {
  read: "DEPENDENCY_UNAVAILABLE",
  send: "OPERATION_OUTCOME_UNKNOWN",
  receipt: "RECEIPT_OUTCOME_UNKNOWN",
};
const envelope = (code: string) => ({
  ok: false,
  error: { code, message: "Failure" },
  meta: { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
});
for (const name of ["read", "send", "receipt"] as const) {
  for (const code of ["SESSION_REVOKED", "ACCESS_TOKEN_EXPIRED"]) {
    for (const complete of [false, true]) {
      test(`${name}: ${complete ? "complete" : "incomplete"} ${code} controls session only after contract validation`, async () => {
        const fixture = sessionFixture();
        const effects: string[] = [];
        const dependencies = {
          ...fixture.dependencies,
          store: {
            ...fixture.dependencies.store,
            block: async () => {
              effects.push("block");
            },
            beginRefresh: async () => {
              effects.push("refresh");
              throw new Error("Refresh observed");
            },
          },
        };
        const raw = complete ? envelope(code) : { ok: false, error: { code } };
        const result = await executeAuthorized(
          {
            bindingId: "binding",
            request: async () =>
              decoders[name](new Response(null, { status: 401 }), raw),
          },
          dependencies,
        );
        expect(effects).toEqual(
          complete ? [code === "SESSION_REVOKED" ? "block" : "refresh"] : [],
        );
        if (!complete)
          expect(result).toMatchObject({
            tag: "Error",
            error: { code: fallback[name], status: 401 },
          });
      });
    }
  }
  test(`${name}: unknown code and non-JSON preserve failure policy`, () => {
    for (const raw of [
      envelope("FUTURE_CODE"),
      "<html>upstream failed</html>",
    ]) {
      expect(
        decoders[name](new Response(null, { status: 503 }), raw),
      ).toMatchObject({
        tag: "Error",
        error: { code: fallback[name], status: 503 },
      });
    }
  });
}
test("mutating decoders preserve Retry-After on valid 429 and unknown outcomes", () => {
  for (const [name, code] of [
    ["send", "MESSAGES_RATE_LIMITED"],
    ["receipt", "RECEIPTS_RATE_LIMITED"],
  ] as const) {
    const response = new Response(null, {
      status: 429,
      headers: { "Retry-After": "7" },
    });
    expect(decoders[name](response, envelope(code))).toMatchObject({
      tag: "Error",
      error: { code, status: 429, retryAfter: "7" },
    });
    expect(decoders[name](response, envelope("FUTURE_CODE"))).toMatchObject({
      tag: "Error",
      error: { code: fallback[name], status: 429, retryAfter: "7" },
    });
  }
});

test("started-conversation target reader rejects incomplete failure envelopes", async () => {
  const { loadStartedConversation } = await import(
    "../../../apps/fe-insta/src/domains/conversations/server/targets/read"
  );
  await expect(
    loadStartedConversation(
      Response.json(
        { ok: false, error: { code: "SESSION_REVOKED" } },
        { status: 401 },
      ),
    ),
  ).rejects.toThrow();
  expect(
    await loadStartedConversation(
      Response.json(envelope("SESSION_REVOKED"), { status: 401 }),
    ),
  ).toMatchObject({
    tag: "Error",
    error: { code: "SESSION_REVOKED", status: 401 },
  });
});
