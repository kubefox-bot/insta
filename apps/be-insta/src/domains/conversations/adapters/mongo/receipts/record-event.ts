import { realtimeEventTypes } from "@insta/contracts/realtime";
import type { ReceiptEvent } from "../../../ports/receipt-outbox";
import { appendDeliveryWithinTransaction } from "../delivery/append";
import { receiptCollections } from "./conts";
import type { ReceiptOutboxDocument, ReceiptTransaction } from "./types";
/** Сохраняет исходный changed snapshot и его conversation/read-unread ссылки в той же транзакции. */
export const recordReceiptEvent = async ({
  db,
  session,
  input,
  eventId,
  serverNowMs,
  retentionMs,
  changed,
}: ReceiptTransaction & Readonly<{ changed: ReceiptEvent["receipts"] }>) => {
  await db
    .collection<ReceiptOutboxDocument>(receiptCollections.outbox)
    .insertOne(
      {
        _id: eventId,
        eventId,
        conversationId: input.conversationId,
        receipts: [...changed],
        createdAt: input.nowMs,
        state: "pending",
        attempts: 0,
        nextAttemptAt: input.nowMs,
        leaseUntil: 0,
      },
      { session },
    );
  await appendDeliveryWithinTransaction({
    db,
    session,
    source: { kind: "receipt", eventId },
    targets: [
      {
        stream: { kind: "conversation", id: input.conversationId },
        eventType: realtimeEventTypes.messageReceiptsUpdated,
      },
      ...Array.from(
        new Set(
          changed
            .filter((receipt) => receipt.readAt !== null)
            .map((receipt) => receipt.recipientId),
        ),
        (id) => ({
          stream: { kind: "unread" as const, id },
          eventType: realtimeEventTypes.unreadChanged,
        }),
      ),
    ],
    createdAt: input.nowMs,
    serverNowMs,
    retentionMs,
  });
};
