import { expect, test } from "bun:test";
import {
  ConversationErrorCode,
  ReceiptErrorCode,
} from "@insta/contracts/errors";
import { createCommitReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/commit";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

test("nonmember and own, foreign or missing IDs reject the complete batch without effects", async () => {
  const f = await createReceiptFixture();
  try {
    const commit = createCommitReceipts(f);
    for (const candidate of [
      {
        actorId: f.mallory,
        messageIds: f.ids.slice(0, 1),
        error: ConversationErrorCode.ConversationForbidden as const,
      },
      ...[f.ids[2], f.ids[3], "000000000000000000000001"].map((id) => ({
        actorId: f.bob,
        messageIds: [f.ids[0] ?? "", id ?? ""],
        error: ReceiptErrorCode.InvalidReceiptBatch as const,
      })),
    ]) {
      const result = await commit({
        ...candidate,
        conversationId: f.conversationId,
        status: "read",
        nowMs: 500,
      });
      expect(result.isError() ? result.getError() : undefined).toBe(
        candidate.error,
      );
      expect(
        await f.db.collection("conversations_receipts").countDocuments({}),
      ).toBe(0);
      expect(
        await f.db
          .collection("conversations_receipt_outbox")
          .countDocuments({}),
      ).toBe(0);
    }
  } finally {
    await f.close();
  }
});
