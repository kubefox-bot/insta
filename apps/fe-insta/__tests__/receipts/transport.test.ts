import { expect, test } from "bun:test";
import { createReceiptTransport } from "../../src/domains/conversations/browser/receipts/transport";
import { webSessionHeaders } from "../../src/lib/session/contracts/index";

const actor = { userId: "recipient", generation: "login1" };
const conversationId = "c".repeat(24);
const snapshot = {
  conversationId,
  receipts: [
    {
      messageId: "m",
      recipientId: "recipient",
      sequence: 1,
      deliveredAt: "2026-10-11T10:00:00.000Z",
      readAt: null,
    },
  ],
};
const input = {
  conversationId,
  messageIds: ["m"],
  status: "delivered" as const,
  signal: new AbortController().signal,
};

test("acknowledgment sends only server-owned receipt inputs with session fence and signal", async () => {
  const transport = createReceiptTransport({
    actor,
    request: async (url, init) => {
      expect(url).toBe(`/api/conversations/${conversationId}/receipts`);
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.signal).toBe(input.signal);
      expect(new Headers(init?.headers).get(webSessionHeaders.generation)).toBe(
        "login1",
      );
      expect(new Headers(init?.headers).get(webSessionHeaders.ownerId)).toBe(
        "recipient",
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        messageIds: ["m"],
        status: "delivered",
      });
      return Response.json({ ok: true, data: snapshot });
    },
  });
  expect(await transport.acknowledge(input)).toEqual(snapshot);
});

for (const [status, raw, code] of [
  [
    403,
    { ok: false, error: { code: "CONVERSATION_FORBIDDEN" } },
    "CONVERSATION_FORBIDDEN",
  ],
  [200, { ok: true, data: { receipts: [] } }, "INVALID_CONTRACT"],
  [
    200,
    { ok: true, data: { ...snapshot, conversationId: "another" } },
    "INVALID_CONTRACT",
  ],
] as const) {
  test(`acknowledgment preserves failure ${status}/${code}`, async () => {
    const transport = createReceiptTransport({
      actor,
      request: async () => Response.json(raw, { status }),
    });
    await expect(transport.acknowledge(input)).rejects.toThrow(code);
  });
}
test("rate limit preserves Retry-After for queue owner", async () => {
  const transport = createReceiptTransport({
    actor,
    request: async () =>
      Response.json(
        { ok: false, error: { code: "RECEIPTS_RATE_LIMITED" } },
        { status: 429, headers: { "Retry-After": "3" } },
      ),
  });
  try {
    await transport.acknowledge(input);
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toMatchObject({
      code: "RECEIPTS_RATE_LIMITED",
      status: 429,
      retryAfter: "3",
    });
  }
});
test("network failure stays rejected and never turns into empty receipts", async () => {
  const failure = new Error("offline");
  const transport = createReceiptTransport({
    actor,
    request: async () => {
      throw failure;
    },
  });
  await expect(transport.acknowledge(input)).rejects.toBe(failure);
});
test("invalid oversized input is rejected before request", async () => {
  const transport = createReceiptTransport({
    actor,
    request: async () => {
      throw new Error("Unexpected request");
    },
  });
  await expect(
    transport.acknowledge({
      ...input,
      messageIds: Array.from({ length: 51 }, (_, index) => String(index)),
    }),
  ).rejects.toThrow("INVALID_RECEIPT_BATCH");
});

test("aborted owned request never publishes a late successful receipt response", async () => {
  const cancellation = new AbortController();
  const reached = Promise.withResolvers<void>();
  const held = Promise.withResolvers<Response>();
  const transport = createReceiptTransport({
    actor,
    request: async () => {
      reached.resolve();
      return held.promise;
    },
  });
  const pending = transport.acknowledge({
    ...input,
    signal: cancellation.signal,
  });
  await reached.promise;
  cancellation.abort();
  held.resolve(Response.json({ ok: true, data: snapshot }));
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
