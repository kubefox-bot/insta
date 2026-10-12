import { expect, test } from "bun:test";
import { createConversationTransport } from "../../../apps/fe-insta/src/domains/conversations/browser/transport";
import { dispatchEvent } from "../../../apps/fe-insta/src/lib/realtime/dispatch-event";

const event = {
  version: 1,
  kind: "event",
  type: "conversations.unread.changed",
  eventId: crypto.randomUUID(),
  occurredAt: "2026-10-20T00:00:00.000Z",
  meta: { requestId: crypto.randomUUID() },
  data: { conversationId: "conv_one" },
  delivery: {
    subscriptionId: crypto.randomUUID(),
    streamId: "unread:alice",
    epoch: crypto.randomUUID(),
    cursor: 1,
  },
} as const;

test("handled is observed only after asynchronous application settles", async () => {
  const applied = Promise.withResolvers<void>();
  const observations: string[] = [];
  const operation = dispatchEvent({
    payload: event,
    handlers: {
      "messages.created": async () => "stale" as const,
      "messages.receipts.updated": async () => "stale" as const,
      "conversations.unread.changed": async () => {
        await applied.promise;
        return "applied" as const;
      },
    },
    observe: ({ kind }) => observations.push(kind),
  });
  expect(observations).toEqual([]);
  applied.resolve();
  expect(await operation).toBe("applied");
  expect(observations).toEqual(["handled"]);
});

test("empty 429 and HTML 503 preserve HTTP failure status and Retry-After", async () => {
  for (const status of [429, 503]) {
    const transport = createConversationTransport({
      actor: { userId: "alice", generation: "one" },
      request: async () =>
        new Response(status === 429 ? "" : "<html>busy</html>", {
          status,
          headers: { "Retry-After": "2" },
        }),
    });
    const failure = await transport.list().catch((error: unknown) => error);
    expect(failure).toMatchObject({ status, retryAfterMs: 2000 });
  }
});

test.each([
  ["2", 2000],
  ["Tue, 20 Oct 2026 00:00:03 GMT", 3000],
  ["nonsense", undefined],
  ["0.0001", 1],
  ["999999999999999", Number.MAX_SAFE_INTEGER],
])(
  "Retry-After %s preserves typed transient failure with normalized delay",
  async (header, retryAfterMs) => {
    const transport = createConversationTransport({
      actor: { userId: "alice", generation: "one" },
      now: () => Date.parse("2026-10-20T00:00:00Z"),
      request: async () =>
        new Response("<html>busy</html>", {
          status: 503,
          headers: { "Retry-After": String(header) },
        }),
    });
    const failure = await transport.list().catch((error: unknown) => error);
    expect(failure).toMatchObject({ status: 503, retryAfterMs });
  },
);
