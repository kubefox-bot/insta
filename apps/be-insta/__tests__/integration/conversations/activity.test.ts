import { expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { createCommitMessage } from "../../../src/domains/conversations/server/index";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

test("out-of-order message timestamps never decrease conversation activity", async () => {
  const fixture = await createReceiptFixture();
  try {
    const commit = createCommitMessage(fixture);
    for (const row of [
      { createdAt: 3000, activityAt: 3000, sequence: 4 },
      { createdAt: 1000, activityAt: 3000, sequence: 5 },
      { createdAt: 5000, activityAt: 5000, sequence: 6 },
    ]) {
      const result = await commit({
        actorId: fixture.alice,
        conversationId: fixture.conversationId,
        text: "synthetic reordered message",
        fingerprint: crypto.randomUUID(),
        operationId: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        analyticsEventId: crypto.randomUUID(),
        createdAt: row.createdAt,
      });
      if (result.isError()) throw new Error(result.getError());
      const outcome = result.get();
      if (outcome.kind !== "committed") throw new Error(outcome.kind);
      expect(outcome.message.createdAt).toBe(row.createdAt);
      expect(outcome.message.sequence).toBe(row.sequence);
      const conversation = await fixture.db
        .collection(collections.conversations)
        .findOne({ _id: new ObjectId(fixture.conversationId) });
      expect(conversation?.lastActivityAt).toEqual(new Date(row.activityAt));
      expect(conversation?.lastSequence).toBe(row.sequence);
      const message = await fixture.db
        .collection(collections.messages)
        .findOne({ _id: new ObjectId(outcome.message.id) });
      expect(message?.createdAt).toEqual(new Date(row.createdAt));
      expect(message?.sequence).toBe(row.sequence);
    }
  } finally {
    await fixture.close();
  }
});
