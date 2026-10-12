import { z } from "zod";

export const deliveryPositionSchema = z.strictObject({
  streamId: z.string().min(1),
  epoch: z.uuid(),
  cursor: z.int().nonnegative(),
});
export const deliveryAckSchema = deliveryPositionSchema.extend({
  subscriptionId: z.uuid(),
});
export const preparedSubscriptionSchema = z.strictObject({
  subscriptionId: z.uuid(),
  baseline: deliveryPositionSchema,
});
