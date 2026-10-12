import {
  deliveryPositionSchema,
  realtimeEventTypes,
} from "@insta/contracts/realtime";
import { ObjectId } from "mongodb";
import { z } from "zod";
export const deliverySourceSchema = z.strictObject({
  kind: z.enum(["message", "receipt", "notification"]),
  eventId: z.uuid(),
});
export const deliveryMetadataSchema = deliveryPositionSchema.extend({
  _id: z.string(),
  trimmedThrough: z.int().nonnegative(),
  lastRecordedAt: z.int().nonnegative(),
  lastExpiresAt: z.int().nonnegative(),
});
export const deliveryDocumentSchema = deliveryPositionSchema.extend({
  _id: z.instanceof(ObjectId),
  eventId: z.uuid(),
  eventType: z.enum([
    realtimeEventTypes.storiesChanged,
    realtimeEventTypes.messageCreated,
    realtimeEventTypes.messageReceiptsUpdated,
    realtimeEventTypes.unreadChanged,
  ]),
  source: deliverySourceSchema,
  createdAt: z.int().nonnegative(),
  recordedAt: z.date(),
  expiresAt: z.date(),
});

export const recoveryTargetSchema = deliveryPositionSchema.extend({
  expiresAt: z.date(),
});
export const recoverySourceSchema = z.object({
  recoveryExpiresAt: z.date(),
  recoveryTargets: z.array(recoveryTargetSchema).min(1),
  createdAt: z.int().nonnegative(),
});
