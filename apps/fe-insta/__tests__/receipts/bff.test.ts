import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { sessionFixture } from "../../../../__tests__/fixtures/chat05/session";
import { acknowledgeReceiptRequest } from "../../src/domains/conversations/server/receipts/acknowledge";
import type { ReceiptBackend } from "../../src/domains/conversations/server/receipts/types";
import { webSessionHeaders } from "../../src/lib/session/contracts/index";
import { encryptSessionCookie } from "../../src/lib/session/server/cookies";

const conversationId = "c".repeat(24);
const snapshot = {
  conversationId,
  receipts: [
    {
      messageId: "m",
      recipientId: "alice",
      sequence: 1,
      deliveredAt: "2026-10-11T10:00:00.000Z",
      readAt: null,
    },
  ],
};
const fixture = async () => {
  const sessions = sessionFixture();
  if (!sessions.state.binding) throw new Error("Missing binding");
  const bindingId = crypto.randomUUID();
  sessions.state.binding = { ...sessions.state.binding, bindingId };
  const cookieKey = new Uint8Array(32).fill(1);
  const cookie = await encryptSessionCookie({
    bindingId,
    absoluteExpiresAt: 3000,
    key: cookieKey,
  });
  return { sessions, cookieKey, cookies: { get: () => cookie } };
};
const input = (
  cookies: { get: () => string },
  payload: unknown = { messageIds: ["m"], status: "delivered" },
  origin = "https://local.test",
  generation = "login1",
) => ({
  cookies,
  origin: "https://local.test",
  conversationId,
  request: new Request(
    `https://local.test/api/conversations/${conversationId}/receipts`,
    {
      method: "POST",
      headers: {
        origin,
        "Content-Type": "application/json",
        [webSessionHeaders.ownerId]: "alice",
        [webSessionHeaders.generation]: generation,
      },
      body: JSON.stringify(payload),
    },
  ),
});
test("protected receipt BFF uses bound session token and strict recipient acknowledgment payload", async () => {
  const f = await fixture();
  const backend: ReceiptBackend = async (request) => {
    expect(request).toEqual({
      accessToken: "access",
      conversationId,
      payload: { messageIds: ["m"], status: "delivered" },
    });
    return Result.Ok(snapshot);
  };
  const response = await acknowledgeReceiptRequest(input(f.cookies), {
    sessions: f.sessions.dependencies,
    cookieKey: f.cookieKey,
    backend,
    context: { requestId: "public", consentProof: "private" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    data: snapshot,
    meta: { requestId: "public" },
  });
});
for (const [payload, origin, generation, status] of [
  [
    { messageIds: ["m"], status: "read", recipientId: "other" },
    "https://local.test",
    "login1",
    400,
  ],
  [
    { messageIds: ["m"], status: "read" },
    "https://foreign.test",
    "login1",
    403,
  ],
  [{ messageIds: ["m"], status: "read" }, "https://local.test", "login2", 409],
] as const) {
  test(`BFF rejects ${status} before receipt mutation`, async () => {
    const f = await fixture();
    const backend: ReceiptBackend = async () => {
      throw new Error("Unexpected mutation");
    };
    const response = await acknowledgeReceiptRequest(
      input(f.cookies, payload, origin, generation),
      {
        sessions: f.sessions.dependencies,
        cookieKey: f.cookieKey,
        backend,
        context: {},
      },
    );
    expect(response.status).toBe(status);
  });
}
for (const error of [
  { code: "CONVERSATION_FORBIDDEN", status: 403 },
  { code: "RECEIPTS_RATE_LIMITED", status: 429, retryAfter: "2" },
  { code: "RECEIPT_OUTCOME_UNKNOWN", status: 503 },
]) {
  test(`backend ${error.code} remains failed with no empty success`, async () => {
    const f = await fixture();
    const response = await acknowledgeReceiptRequest(input(f.cookies), {
      sessions: f.sessions.dependencies,
      cookieKey: f.cookieKey,
      backend: async () => Result.Error(error),
      context: {},
    });
    expect(response.status).toBe(error.status);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: error.code },
    });
    expect(response.headers.get("Retry-After")).toBe(error.retryAfter ?? null);
  });
}
