import {
  replayPayloadSchema,
  storiesFeedStream,
} from "@insta/contracts/realtime";
import { deliveryCollections, deliveryReadOptions } from "../conts";
import { recoverySourceSchema } from "../schema";
import type { MaterializeInput } from "./types";
/** Validates source identity and target before reconstructing the retained notification. */
export const materializeNotification = async ({
  db,
  event,
  signal,
}: MaterializeInput) => {
  const source = recoverySourceSchema
    .extend({ payload: replayPayloadSchema })
    .parse(
      await db
        .collection<{ _id: string }>(
          deliveryCollections.notifications,
          deliveryReadOptions,
        )
        .findOne({ _id: event.source.eventId }, { signal }),
    );
  const matched = source.recoveryTargets.some(
    (target) =>
      target.streamId === event.streamId &&
      target.epoch === event.epoch &&
      target.cursor === event.cursor &&
      target.expiresAt.getTime() === event.expiresAt,
  );
  if (
    !matched ||
    event.streamId !== `${storiesFeedStream.kind}:${storiesFeedStream.id}` ||
    source.createdAt !== event.createdAt ||
    source.payload.eventId !== event.eventId ||
    source.payload.type !== event.eventType
  )
    throw new Error("Invalid notification identity");
  return source.payload;
};
