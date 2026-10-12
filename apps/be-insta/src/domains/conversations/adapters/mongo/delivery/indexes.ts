import type { Db } from "mongodb";
import { collections } from "../conts";
import { receiptCollections } from "../receipts/conts";
import { deliveryCollections } from "./conts";
/** Создаёт уникальные позиции, source-ссылки и индекс срока; физическое удаление принадлежит транзакционному prune с durable floor. */
export const ensureDeliveryIndexes = async (db: Db) => {
  await db
    .collection(deliveryCollections.notifications)
    .createIndex({ recoveryExpiresAt: 1 });
  await db.collection(collections.outbox).createIndex({ recoveryExpiresAt: 1 });
  await db
    .collection(receiptCollections.outbox)
    .createIndex({ recoveryExpiresAt: 1 });
  await db
    .collection(deliveryCollections.metadata)
    .createIndex({ streamId: 1 }, { unique: true });
  await db.collection(deliveryCollections.journal).createIndexes([
    { key: { streamId: 1, epoch: 1, cursor: 1 }, unique: true },
    {
      key: { streamId: 1, eventType: 1, "source.kind": 1, eventId: 1 },
      unique: true,
    },
    { key: { "source.kind": 1, "source.eventId": 1 } },
    { key: { expiresAt: 1, streamId: 1, cursor: 1 } },
  ]);
};
