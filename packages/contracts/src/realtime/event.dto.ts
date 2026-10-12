import { z } from "zod";
import { correlationSchema } from "../http/index";
import {
  messageSchema,
  receiptBatchSnapshotSchema,
  wireIdSchema,
} from "../messages/index";
import {
  realtimeEventTypes,
  realtimeKinds,
  realtimeProtocolVersion,
} from "./conts";
import { deliveryAckSchema } from "./delivery-position.dto";

const base = {
  version: z.literal(realtimeProtocolVersion),
  kind: z.literal(realtimeKinds.event),
  eventId: z.uuid(),
  occurredAt: z.iso.datetime(),
  meta: correlationSchema,
};
const unreadPayloadSchema = z.strictObject({
  ...base,
  type: z.literal(realtimeEventTypes.unreadChanged),
  data: z.strictObject({ conversationId: wireIdSchema }),
});
const messagePayloadSchema = z.strictObject({
  ...base,
  type: z.literal(realtimeEventTypes.messageCreated),
  data: z.strictObject({ message: messageSchema }),
});
const receiptsPayloadSchema = z.strictObject({
  ...base,
  type: z.literal(realtimeEventTypes.messageReceiptsUpdated),
  data: receiptBatchSnapshotSchema,
});
const storiesPayloadSchema = z.strictObject({
  ...base,
  type: z.literal(realtimeEventTypes.storiesChanged),
  data: z.strictObject({}),
});
export const replayPayloadSchema = z.discriminatedUnion("type", [
  storiesPayloadSchema,
  unreadPayloadSchema,
  messagePayloadSchema,
  receiptsPayloadSchema,
]);
export const unreadEventSchema = unreadPayloadSchema.extend({
  delivery: deliveryAckSchema,
});
export const eventSchema = z.discriminatedUnion("type", [
  storiesPayloadSchema.extend({ delivery: deliveryAckSchema }),
  unreadEventSchema,
  messagePayloadSchema.extend({ delivery: deliveryAckSchema }),
  receiptsPayloadSchema.extend({ delivery: deliveryAckSchema }),
]);
