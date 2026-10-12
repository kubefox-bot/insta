import { z } from "zod";
import {
  deliveryReplyKinds,
  deliveryUnitKinds,
  maxUnreadBatchSize,
} from "./conts";
import { deliveryAckSchema } from "./delivery-position.dto";
import { eventSchema, unreadEventSchema } from "./event.dto";

export const deliveryReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal(deliveryReplyKinds.applied),
    position: deliveryAckSchema,
  }),
  z.strictObject({
    kind: z.literal(deliveryReplyKinds.retryLater),
    position: deliveryAckSchema,
    retryAfterMs: z.int().nonnegative().optional(),
  }),
  z.strictObject({
    kind: z.literal(deliveryReplyKinds.applyFailed),
    position: deliveryAckSchema,
  }),
]);
const unreadBatchSchema = z
  .strictObject({
    kind: z.literal(deliveryUnitKinds.unreadBatch),
    events: z.array(unreadEventSchema).min(1).max(maxUnreadBatchSize),
  })
  .refine(({ events }) => {
    const first = events[0];
    if (!first) return false;
    const start = first.delivery;
    return events.every(
      ({ delivery }, index) =>
        delivery.streamId === start.streamId &&
        delivery.epoch === start.epoch &&
        delivery.subscriptionId === start.subscriptionId &&
        delivery.cursor - start.cursor === index,
    );
  }, "Unread batch must contain consecutive positions from one subscription stream");
export const deliveryUnitSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal(deliveryUnitKinds.single),
    event: eventSchema,
  }),
  unreadBatchSchema,
]);
