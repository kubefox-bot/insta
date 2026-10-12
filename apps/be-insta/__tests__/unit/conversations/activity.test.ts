import { expect, spyOn, test } from "bun:test";
import { Collection, MongoClient, ObjectId } from "mongodb";
import { persistMessage } from "../../../src/domains/conversations/adapters/mongo/messages/persist";

test("message persistence requests an atomic activity maximum while preserving its timestamp and sequence", async () => {
  const client = new MongoClient("mongodb://127.0.0.1:27017");
  const session = client.startSession();
  const messageId = new ObjectId();
  const conversationId = new ObjectId().toHexString();
  const update = spyOn(Collection.prototype, "updateOne").mockResolvedValue({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null,
  });
  const insert = spyOn(Collection.prototype, "insertOne").mockResolvedValue({
    acknowledged: true,
    insertedId: messageId,
  });
  const allocate = spyOn(
    Collection.prototype,
    "findOneAndUpdate",
  ).mockResolvedValue({
    _id: `conversation:${conversationId}`,
    streamId: `conversation:${conversationId}`,
    epoch: crypto.randomUUID(),
    cursor: 1,
    lastRecordedAt: 1000,
    lastExpiresAt: 0,
    trimmedThrough: 0,
  });
  try {
    const message = await persistMessage({
      db: client.db("activity_unit"),
      session,
      messageId,
      sequence: 2,
      serverNowMs: 1000,
      retentionMs: 86400000,
      participantIds: [],
      input: {
        actorId: new ObjectId().toHexString(),
        conversationId,
        text: "delayed message",
        fingerprint: "delayed",
        operationId: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        analyticsEventId: crypto.randomUUID(),
        createdAt: 1000,
      },
    });
    expect(update).toHaveBeenCalledWith(
      { _id: new ObjectId(conversationId) },
      { $inc: { lastSequence: 1 }, $max: { lastActivityAt: new Date(1000) } },
      { session },
    );
    expect(message.createdAt).toBe(1000);
    expect(message.sequence).toBe(2);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      createdAt: new Date(1000),
      sequence: 2,
    });
  } finally {
    allocate.mockRestore();
    update.mockRestore();
    insert.mockRestore();
    await session.endSession();
    await client.close();
  }
});
