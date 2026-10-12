import type { Db } from "mongodb";
import { outboxPolicy } from "../../outbox/conts";
import type { MessageOutbox, OutboxClaim } from "../../ports/outbox";
import { collections } from "./conts";
import { mapOutboxClaim } from "./outbox/claim";
import { expireOutbox } from "./outbox/expire";
import type { OutboxDocument } from "./types";
/**
 * Создаёт lease-based outbox на заимствованном Db, при необходимости ограниченный
 * заданными беседами; каждый sink имеет собственное состояние доставки.
 */
export const createMongoOutbox = ({
  db,
  conversationIds,
}: Readonly<{
  db: Db;
  conversationIds?: readonly string[];
}>): MessageOutbox => {
  const documents = db.collection<OutboxDocument>(collections.outbox);
  const scope =
    conversationIds === undefined
      ? {}
      : { conversationId: { $in: [...conversationIds] } };
  /**
   * Строит условие владения pending-доставкой по event, sink и leaseId в разрешённом
   * scope.
   */
  const owned = (claim: OutboxClaim) => ({
    ...scope,
    _id: claim.event.eventId,
    [`deliveries.${claim.sink}.state`]: "pending",
    [`deliveries.${claim.sink}.leaseId`]: claim.leaseId,
  });
  return {
    /**
     * Атомарно арендует старейшую доступную доставку sink и увеличивает attempts; null
     * означает отсутствие работы, projection не передаётся в событие.
     */
    claim: async ({ sink, now, leaseId }) => {
      const path = `deliveries.${sink}`;
      const row = await documents.findOneAndUpdate(
        {
          ...scope,
          [`${path}.state`]: "pending",
          [`${path}.nextAttemptAt`]: { $lte: now },
          [`${path}.leaseUntil`]: { $lte: now },
        },
        {
          $set: {
            [`${path}.leaseId`]: leaseId,
            [`${path}.leaseUntil`]: now + outboxPolicy.leaseMs,
          },
          $inc: { [`${path}.attempts`]: 1 },
        },
        { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" },
      );
      if (!row) return null;
      return mapOutboxClaim({ document: row, sink, leaseId });
    },
    /**
     * Помечает доставленной только принадлежащую claim ещё живую аренду, снимая lease;
     * false означает, что запись не была изменена.
     */
    complete: async (input) =>
      (
        await documents.updateOne(
          {
            ...owned(input),
            [`deliveries.${input.sink}.leaseUntil`]: { $gt: input.now },
          },
          {
            $set: {
              [`deliveries.${input.sink}.state`]: "delivered",
              [`deliveries.${input.sink}.deliveredAt`]: input.now,
              [`deliveries.${input.sink}.leaseUntil`]: 0,
            },
            $unset: { [`deliveries.${input.sink}.leaseId`]: "" },
          },
        )
      ).modifiedCount === 1,
    /** Завершает истёкший realtime source под собственной арендой, без успешной публикации. */
    expire: (input) => expireOutbox({ documents, input, owned: owned(input) }),
    /** Планирует retry собственной pending-аренды и освобождает её. */
    fail: async (input) =>
      (
        await documents.updateOne(owned(input), {
          $set: {
            [`deliveries.${input.sink}.nextAttemptAt`]: input.nextAttemptAt,
            [`deliveries.${input.sink}.leaseUntil`]: 0,
          },
          $unset: { [`deliveries.${input.sink}.leaseId`]: "" },
        })
      ).modifiedCount === 1,
  };
};
