import { z } from "zod";
import { correlationSchema } from "../http/index";
import { wireIdSchema } from "../messages/index";
import {
  realtimeCommandTypes,
  realtimeKinds,
  realtimeProtocolVersion,
} from "./conts";
import {
  deliveryPositionSchema,
  preparedSubscriptionSchema,
} from "./delivery-position.dto";
export const conversationSelectionSchema = z.strictObject({
  conversationId: wireIdSchema,
});
const base = {
  version: z.literal(realtimeProtocolVersion),
  kind: z.literal(realtimeKinds.command),
  meta: correlationSchema,
};
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal(realtimeCommandTypes.storiesSubscribe),
    data: z.strictObject({ resume: deliveryPositionSchema.optional() }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(realtimeCommandTypes.storiesUnsubscribe),
    data: z.strictObject({}),
  }),
  z.strictObject({
    ...base,
    type: z.literal(realtimeCommandTypes.subscribe),
    data: conversationSelectionSchema.extend({
      resume: deliveryPositionSchema.optional(),
    }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(realtimeCommandTypes.unsubscribe),
    data: conversationSelectionSchema,
  }),
  z.strictObject({
    ...base,
    type: z.literal(realtimeCommandTypes.unreadSubscribe),
    data: z.strictObject({ resume: deliveryPositionSchema.optional() }),
  }),
  z.strictObject({
    ...base,
    type: z.literal(realtimeCommandTypes.unreadUnsubscribe),
    data: z.strictObject({}),
  }),
  z.strictObject({
    ...base,
    type: z.literal(realtimeCommandTypes.activate),
    data: preparedSubscriptionSchema,
  }),
]);
