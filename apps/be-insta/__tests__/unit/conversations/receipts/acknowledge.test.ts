import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import type { ReceiptDependencies } from "../../../../src/domains/conversations/ports/receipts";
import { acknowledgeReceipts } from "../../../../src/domains/conversations/use-cases/receipts/acknowledge";

const input = {
  actorId: "000000000000000000000001",
  conversationId: "000000000000000000000002",
  messageIds: ["000000000000000000000003"],
  status: "read",
} as const;
const unavailable: ReceiptDependencies = {
  quota: { consume: async () => Result.Error("unavailable") },
  clock: () => {
    throw new Error("clock after rejection");
  },
  commitReceipts: async () => {
    throw new Error("commit after rejection");
  },
};
test("limited admission prevents receipt effects", async () => {
  const result = await acknowledgeReceipts(input, {
    ...unavailable,
    quota: { consume: async () => Result.Ok("limited") },
  });
  expect(String(result.isError() ? result.getError() : undefined)).toBe(
    "RECEIPTS_RATE_LIMITED",
  );
});
test("invalid batch prevents quota and storage effects", async () => {
  const result = await acknowledgeReceipts(
    { ...input, messageIds: [] },
    {
      ...unavailable,
      quota: {
        consume: async () => {
          throw new Error("quota before validation");
        },
      },
    },
  );
  expect(String(result.isError() ? result.getError() : undefined)).toBe(
    "INVALID_RECEIPT_BATCH",
  );
});
test("admitted batch is normalized and uses server clock", async () => {
  const result = await acknowledgeReceipts(
    { ...input, messageIds: [...input.messageIds, ...input.messageIds] },
    {
      quota: { consume: async () => Result.Ok("allowed") },
      clock: () => 500,
      commitReceipts: async (value) =>
        Result.Ok({
          conversationId: value.conversationId,
          receipts: value.messageIds.map((messageId) => ({
            messageId,
            recipientId: value.actorId,
            sequence: 1,
            deliveredAt: value.nowMs,
            readAt: value.nowMs,
          })),
        }),
    },
  );
  expect(result.isOk() ? result.get() : undefined).toEqual({
    conversationId: input.conversationId,
    receipts: [
      {
        messageId: input.messageIds[0],
        recipientId: input.actorId,
        sequence: 1,
        deliveredAt: 500,
        readAt: 500,
      },
    ],
  });
});
test("quota outage is not an empty successful snapshot", async () => {
  const result = await acknowledgeReceipts(input, unavailable);
  expect(String(result.isError() ? result.getError() : undefined)).toBe(
    "DEPENDENCY_UNAVAILABLE",
  );
});
