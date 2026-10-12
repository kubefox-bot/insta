import type { Db } from "mongodb";
import { collections } from "./conts";
/**
 * Создаёт уникальность пары, sequence, message identity и индексы outbox; после создания
 * узкой замены удаляет только прежний индекс conversationId_1_kind_1.
 */
export const ensureConversationsIndexes = async (db: Db) => {
  await db
    .collection(collections.conversations)
    .createIndexes([
      { key: { pairKey: 1 }, unique: true },
      { key: { participantIds: 1, lastActivityAt: -1, _id: -1 } },
    ]);
  await db
    .collection(collections.messages)
    .createIndex({ conversationId: 1, sequence: 1 }, { unique: true });
  await db.collection(collections.events).createIndexes([
    {
      key: { conversationId: 1, kind: 1 },
      name: "conversation_created_unique",
      unique: true,
      partialFilterExpression: { kind: "conversation_created" },
    },
    {
      key: { eventId: 1 },
      unique: true,
      partialFilterExpression: { eventId: { $type: "string" } },
    },
    {
      key: { analyticsEventId: 1 },
      unique: true,
      partialFilterExpression: { analyticsEventId: { $type: "string" } },
    },
  ]);
  // CHAT-01's unique index covered every kind before message events existed.
  // Establish its narrower replacement first, then remove that old index only.
  const old = (
    await db.collection(collections.events).listIndexes().toArray()
  ).find((index) => index.name === "conversationId_1_kind_1");
  if (old) await db.collection(collections.events).dropIndex(old.name);
  await db.collection(collections.identities).createIndex(
    { actorId: 1, keyDigest: 1 },
    {
      unique: true,
      partialFilterExpression: { keyDigest: { $type: "string" } },
    },
  );
  await db.collection(collections.outbox).createIndexes(
    ["realtime", "analytics"].map((sink) => ({
      key: {
        [`deliveries.${sink}.state`]: 1,
        [`deliveries.${sink}.nextAttemptAt`]: 1,
        [`deliveries.${sink}.leaseUntil`]: 1,
      },
    })),
  );
};
