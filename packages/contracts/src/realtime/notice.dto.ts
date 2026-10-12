import { z } from "zod";
import { RealtimeErrorCode } from "./codes";
import { realtimeKinds, realtimeProtocolVersion } from "./conts";
import {
  deliveryPositionSchema,
  preparedSubscriptionSchema,
} from "./delivery-position.dto";

export const deliveryNoticeSchema = z.strictObject({
  version: z.literal(realtimeProtocolVersion),
  kind: z.literal(realtimeKinds.deliveryNotice),
  subscriptionId: preparedSubscriptionSchema.shape.subscriptionId,
  streamId: deliveryPositionSchema.shape.streamId,
  epoch: deliveryPositionSchema.shape.epoch,
  code: z.enum([
    RealtimeErrorCode.DeliveryBlocked,
    RealtimeErrorCode.ResyncRequired,
  ]),
});
// Receipt подтверждает установку notice state, не business cursor и не bootstrap I/O.
export const deliveryNoticeReceiptSchema = deliveryNoticeSchema;
