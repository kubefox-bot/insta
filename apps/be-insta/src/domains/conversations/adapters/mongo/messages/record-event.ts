import { realtimeEventTypes } from "@insta/contracts/realtime";
import { originalProjection } from "../../../../../lib/observability/analytics/index";
import { canonicalMessage } from "../../../business/canonical";
import { collections } from "../conts";
import { appendDeliveryWithinTransaction } from "../delivery/append";
import { initialDeliveries } from "../outbox-state";
import type { OutboxDocument } from "../types";
import type { PersistMessageInput } from "./types";
/** Записывает canonical audit, outbox и адресные journal references одной бизнес-транзакцией; payload сообщения не копируется в journal. */
export const recordMessageEvent = async ({
  db,
  session,
  input,
  messageId,
  sequence,
  reference,
  serverNowMs,
  retentionMs,
  participantIds,
}: PersistMessageInput) => {
  const canonical = canonicalMessage({
    input,
    messageId: messageId.toHexString(),
    sequence,
  });
  // Mongo adds _id to its argument. Independent insertion objects preserve the
  // canonical value and the outbox's stable string event identity.
  await db
    .collection(collections.events)
    .insertOne({ ...canonical }, { session });
  await db.collection<OutboxDocument>(collections.outbox).insertOne(
    {
      _id: input.eventId,
      ...canonical,
      ...originalProjection(reference),
      deliveries: initialDeliveries(input.createdAt),
    },
    { session },
  );
  await appendDeliveryWithinTransaction({
    db,
    session,
    source: { kind: "message", eventId: input.eventId },
    targets: [
      {
        stream: { kind: "conversation", id: input.conversationId },
        eventType: realtimeEventTypes.messageCreated,
      },
      ...participantIds.map((id) => ({
        stream: { kind: "unread" as const, id },
        eventType: realtimeEventTypes.unreadChanged,
      })),
    ],
    createdAt: input.createdAt,
    serverNowMs,
    retentionMs,
  });
};
