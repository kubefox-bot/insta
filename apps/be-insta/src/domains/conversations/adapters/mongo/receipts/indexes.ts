import type { Db } from "mongodb";
import { receiptCollections } from "./conts";
/**
 * Создаёт уникальность message/recipient и индексы истории/outbox; ошибку оборачивает с
 * cause для диагностики readiness.
 */
export const ensureReceiptIndexes = async (db: Db) => {
  try {
    await db.collection(receiptCollections.receipts).createIndexes([
      {
        key: { messageId: 1, recipientId: 1 },
        unique: true,
        name: "receipt_message_recipient_unique",
      },
      {
        key: { conversationId: 1, messageId: 1 },
        name: "receipt_history_page",
      },
    ]);
    await db
      .collection(receiptCollections.outbox)
      .createIndex(
        { state: 1, nextAttemptAt: 1, leaseUntil: 1 },
        { name: "receipt_outbox_claim" },
      );
  } catch (cause) {
    throw new Error("Receipt indexes unavailable", { cause });
  }
};
