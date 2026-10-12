import { ObjectId } from "mongodb";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { ensureDeliveryIndexes } from "../../../src/domains/conversations/adapters/mongo/delivery/indexes";
import { ensureConversationsIndexes } from "../../../src/domains/conversations/adapters/mongo/indexes";
import { ensureReceiptIndexes } from "../../../src/domains/conversations/adapters/mongo/receipts/indexes";
import { connectDatabase } from "../../../src/lib/database/index";
import {
  createDatabaseNamespace,
  runtimeCollectionNamespaceSchema,
} from "../realtime/database-namespace";
export const createReceiptFixture = async () => {
  await using resources = new AsyncDisposableStack();
  const connected = await connectDatabase({
    config: readTestApiConfig().mongo,
  });
  resources.defer(connected.close);
  const namespace = createDatabaseNamespace({
    db: connected.apiDb,
    prefix: runtimeCollectionNamespaceSchema.parse(
      `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
    ),
  });
  resources.defer(namespace.dispose);
  const db = namespace.db;
  await ensureReceiptIndexes(db);
  await ensureConversationsIndexes(db);
  await ensureDeliveryIndexes(db);
  const alice = new ObjectId().toHexString();
  const bob = new ObjectId().toHexString();
  const mallory = new ObjectId().toHexString();
  const conversationId = new ObjectId();
  const foreignId = new ObjectId();
  const ids = Array.from({ length: 4 }, () => new ObjectId());
  await db.collection(collections.conversations).insertOne({
    _id: conversationId,
    participantIds: [alice, bob],
    pairKey: `${alice}:${bob}`,
    lastSequence: 3,
    lastActivityAt: new Date(100),
    createdAt: new Date(100),
  });
  await db.collection(collections.messages).insertMany(
    ids.map((Id, index) => ({
      _id: Id,
      conversationId: (index === 3 ? foreignId : conversationId).toHexString(),
      senderId: index === 2 ? bob : alice,
      text: `synthetic ${index}`,
      sequence: index + 1,
      createdAt: new Date(100),
    })),
  );
  const lifetime = resources.move();
  return {
    db,
    clock: Date.now,
    retentionMs: readTestApiConfig().realtime.retentionMs,
    startSession: connected.startSession,
    alice,
    bob,
    mallory,
    conversationId: conversationId.toHexString(),
    ids: ids.map((id) => id.toHexString()),
    close: () => lifetime.disposeAsync(),
  };
};
