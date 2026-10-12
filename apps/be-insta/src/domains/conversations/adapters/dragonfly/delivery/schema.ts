import {
  deliveryPositionSchema,
  replayPayloadSchema,
} from "@insta/contracts/realtime";
import { z } from "zod";
import { retentionPolicy } from "./conts";
export const materializedDeliverySchema = deliveryPositionSchema
  .extend({
    eventId: z.uuid(),
    eventType: z.enum([
      "stories.feed.changed",
      "messages.created",
      "messages.receipts.updated",
      "conversations.unread.changed",
    ]),
    source: z.strictObject({
      kind: z.enum(["message", "receipt", "notification"]),
      eventId: z.uuid(),
    }),
    createdAt: z.int().nonnegative(),
    recordedAt: z.int().nonnegative(),
    expiresAt: z.int().nonnegative(),
    payload: replayPayloadSchema,
  })
  .refine(
    (value) =>
      value.cursor > 0 &&
      value.eventId === value.payload.eventId &&
      value.eventType === value.payload.type &&
      value.expiresAt > value.recordedAt,
  );
export const streamStateSchema = z.tuple([
  z.uuid(),
  z.string().regex(/^\d+$/),
  z.string().regex(/^\d+$/),
]);
export const streamRowsSchema = z.tuple([
  z.string().regex(/^\d+$/),
  z.array(z.tuple([z.string(), z.tuple([z.literal("event"), z.string()])])),
]);

export const retentionSnapshotSchema = z.tuple([
  z.uuid(),
  z.string().regex(/^\d+$/),
  z.string().regex(/^\d+$/),
  z
    .array(z.tuple([z.string(), z.tuple([z.literal("event"), z.string()])]))
    .max(retentionPolicy.rowsPerStream),
]);
