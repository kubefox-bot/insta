import { expect, test } from "bun:test";
import { messageMarkState } from "../../src/domains/conversations/browser/receipts/domain/message-mark";
import type { Message } from "../../src/domains/conversations/browser/types";

const message: Message = {
  id: "m",
  conversationId: "c",
  authorId: "alice",
  text: "hello",
  sequence: 1,
  createdAt: "2026-10-11T10:00:00.000Z",
};
test("canonical persistence wins over stale terminal queue; only server read/delivered timestamps advance marks", () => {
  expect(
    messageMarkState({
      message,
      queuedRecord: { state: "terminal", errorCode: "FORBIDDEN" },
    }),
  ).toEqual({ kind: "sent" });
  expect(
    messageMarkState({
      message,
      receipt: { deliveredAt: "2026-10-11T10:00:01.000Z", readAt: null },
    }),
  ).toEqual({ kind: "delivered", timestamp: "2026-10-11T10:00:01.000Z" });
  expect(
    messageMarkState({
      message,
      receipt: { deliveredAt: null, readAt: "2026-10-11T10:00:02.000Z" },
    }),
  ).toEqual({ kind: "read", timestamp: "2026-10-11T10:00:02.000Z" });
  expect(messageMarkState({ queuedRecord: { state: "queued" } })).toEqual({
    kind: "waiting",
  });
  expect(
    messageMarkState({
      queuedRecord: { state: "terminal", errorCode: "MESSAGE_REJECTED" },
    }),
  ).toEqual({ kind: "error", code: "MESSAGE_REJECTED" });
});
