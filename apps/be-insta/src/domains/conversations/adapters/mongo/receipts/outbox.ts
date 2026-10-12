import type { Db } from "mongodb";
import { outboxPolicy } from "../../../outbox/conts";
import type {
  ReceiptClaim,
  ReceiptOutbox,
} from "../../../ports/receipt-outbox";
import { receiptCollections } from "./conts";
import { receiptEventSchema, receiptOutboxSchema } from "./schema";
import type { ReceiptOutboxDocument } from "./types";
/**
 * Собирает очередь receipt-событий с арендой на заимствованном Db; запись и освобождение
 * аренды защищены leaseId.
 */
export const createMongoReceiptOutbox = ({
  db,
}: Readonly<{ db: Db }>): ReceiptOutbox => {
  const documents = db.collection<ReceiptOutboxDocument>(
    receiptCollections.outbox,
  );
  /**
   * Ограничивает mutation исходным pending event и leaseId, исключая подтверждение чужого
   * claim.
   */
  const owned = (claim: ReceiptClaim) => ({
    _id: claim.event.eventId,
    state: "pending" as const,
    leaseId: claim.leaseId,
  });
  return {
    /**
     * Атомарно забирает старейший готовый receipt event с истёкшей арендой, увеличивает
     * attempts и валидирует его payload.
     */
    claim: async ({ now, leaseId }) => {
      const row = await documents.findOneAndUpdate(
        {
          state: "pending",
          nextAttemptAt: { $lte: now },
          leaseUntil: { $lte: now },
        },
        {
          $set: { leaseId, leaseUntil: now + outboxPolicy.leaseMs },
          $inc: { attempts: 1 },
        },
        { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" },
      );
      if (!row) return null;
      const value = receiptOutboxSchema.parse(row);
      return {
        event: receiptEventSchema.parse({
          eventId: value.eventId,
          createdAt: value.createdAt,
          conversationId: value.conversationId,
          receipts: value.receipts,
        }),
        leaseId,
        attempts: value.attempts,
      };
    },
    /**
     * Завершает только ещё живую собственную аренду, записывая publishedAt; false
     * сообщает, что подтверждение не применилось.
     */
    complete: async (input) =>
      (
        await documents.updateOne(
          { ...owned(input), leaseUntil: { $gt: input.now } },
          {
            $set: { state: "delivered", publishedAt: input.now, leaseUntil: 0 },
            $unset: { leaseId: "" },
          },
        )
      ).modifiedCount === 1,
    /**
     * Снимает собственную pending-аренду и переносит следующую попытку, сохраняя событие
     * для повтора.
     */
    /** Помечает истёкшее recovery без publishedAt, проверяя собственную живую аренду. */
    expire: async (input) =>
      (
        await documents.updateOne(
          { ...owned(input), leaseUntil: { $gt: input.now } },
          {
            $set: {
              state: "expired",
              recoveryExpiredAt: input.now,
              leaseUntil: 0,
            },
            $unset: { leaseId: "" },
          },
        )
      ).modifiedCount === 1,
    fail: async (input) =>
      (
        await documents.updateOne(owned(input), {
          $set: { nextAttemptAt: input.nextAttemptAt, leaseUntil: 0 },
          $unset: { leaseId: "" },
        })
      ).modifiedCount === 1,
  };
};
