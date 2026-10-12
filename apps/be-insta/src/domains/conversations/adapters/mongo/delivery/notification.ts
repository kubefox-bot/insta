import {
  type ReplayPayload,
  realtimeEventTypes,
  replayPayloadSchema,
  storiesFeedStream,
} from "@insta/contracts/realtime";
import type { ClientSession, Db } from "mongodb";
import { appendDeliveryWithinTransaction } from "./append";
import { deliveryCollections } from "./conts";
/** Owns a durable source manifest; allocation and publication roll back together. */
export const recordFeedNotification = async ({
  db,
  session,
  payload,
  retentionMs,
  serverNowMs,
}: Readonly<{
  db: Db;
  session: ClientSession;
  payload: ReplayPayload;
  retentionMs: number;
  serverNowMs: number;
}>) => {
  const parsed = replayPayloadSchema.parse(payload);
  if (parsed.type !== realtimeEventTypes.storiesChanged)
    throw new Error("Invalid public feed notification");
  await db
    .collection<{
      _id: string;
      eventId: string;
      payload: ReplayPayload;
      createdAt: number;
      state: "pending";
    }>(deliveryCollections.notifications)
    .insertOne(
      {
        _id: parsed.eventId,
        eventId: parsed.eventId,
        payload: parsed,
        createdAt: serverNowMs,
        state: "pending",
      },
      { session },
    );
  await appendDeliveryWithinTransaction({
    db,
    session,
    source: { kind: "notification", eventId: parsed.eventId },
    targets: [{ stream: storiesFeedStream, eventType: parsed.type }],
    createdAt: serverNowMs,
    serverNowMs,
    retentionMs,
  });
};

/** The source can be pruned only after the originating outbox settles in this same transaction. */
export const completeFeedNotification = async ({
  db,
  session,
  eventId,
}: Readonly<{ db: Db; session: ClientSession; eventId: string }>) => {
  const result = await db
    .collection<{ _id: string; state: string }>(
      deliveryCollections.notifications,
    )
    .updateOne({ _id: eventId }, { $set: { state: "delivered" } }, { session });
  if (result.matchedCount !== 1)
    throw new Error("Notification source absent at completion");
};
