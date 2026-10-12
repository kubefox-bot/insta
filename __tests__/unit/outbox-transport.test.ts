import { expect, test } from "bun:test";
import { createOutboxSender } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/sender";

const record = {
  ownerId: "a".repeat(24),
  conversationId: "b".repeat(24),
  text: "persisted payload",
  key: "stable-key",
  clientMessageId: "stable-client",
  operationId: crypto.randomUUID(),
  createdAt: 0,
  attempts: 1,
  nextAttemptAt: 0,
  lastAuthGeneration: "g1",
  revision: 1,
  manualAttempt: false,
  state: "queued",
  needsConfirmation: false,
} as const;
test.each([
  { status: 403, code: "CONVERSATION_FORBIDDEN", want: "terminal" },
  { status: 409, code: "IDEMPOTENCY_CONFLICT", want: "terminal" },
  { status: 409, code: "OPERATION_OUTCOME_UNKNOWN", want: "unknown" },
  { status: 429, code: "MESSAGES_RATE_LIMITED", want: "retry" },
  { status: 401, code: "SESSION_REQUIRED", want: "auth" },
  { status: 409, code: "ACTOR_CHANGED", want: "auth" },
])("BFF send classification $status $code", async ({ status, code, want }) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      expect(request.headers.get("X-Expected-Owner-ID")).toBe(record.ownerId);
      expect(request.headers.get("X-Idempotency-Key")).toBe("stable-key");
      expect(request.headers.get("X-Operation-ID")).toBe(record.operationId);
      expect(await request.json()).toEqual({
        text: "persisted payload",
        clientMessageId: "stable-client",
      });
      return Response.json(
        { ok: false, error: { code, message: code } },
        { status, headers: { "Retry-After": "30" } },
      );
    },
  });
  try {
    const sender = createOutboxSender({
      request: (_input, init) => fetch(server.url, init),
      clock: () => 0,
    });
    const outcome = await sender(record);
    expect(outcome.kind).toBe(want);
    if (outcome.kind === "retry") expect(outcome.retryAfterMs).toBe(30000);
  } finally {
    await server.stop(true);
  }
});
test("foreign account confirmation cannot acknowledge or remove a durable operation", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        ok: true,
        data: {
          id: "server",
          conversationId: record.conversationId,
          authorId: "c".repeat(24),
          clientMessageId: record.clientMessageId,
          text: record.text,
          sequence: 1,
          createdAt: "2026-10-09T00:00:00.000Z",
        },
      }),
  });
  try {
    const result = await createOutboxSender({
      request: (_input, init) => fetch(server.url, init),
    })(record);
    expect(result.kind).toBe("unknown");
  } finally {
    await server.stop(true);
  }
});
