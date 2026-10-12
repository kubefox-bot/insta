import type { z } from "zod";
import type { deliveryReplySchema, deliveryUnitSchema } from "./delivery.dto";
import type {
  deliveryAckSchema,
  deliveryPositionSchema,
  preparedSubscriptionSchema,
} from "./delivery-position.dto";
import type { replayPayloadSchema } from "./event.dto";

export type DeliveryPosition = z.infer<typeof deliveryPositionSchema>;
export type DeliveryAck = z.infer<typeof deliveryAckSchema>;
export type PreparedSubscription = z.infer<typeof preparedSubscriptionSchema>;
export type DeliveryReply = z.infer<typeof deliveryReplySchema>;
export type DeliveryUnit = z.infer<typeof deliveryUnitSchema>;
export type ReplayPayload = z.infer<typeof replayPayloadSchema>;

export type DeliveryNotice = z.infer<
  typeof import("./notice.dto").deliveryNoticeSchema
>;
export type DeliveryNoticeReceipt = z.infer<
  typeof import("./notice.dto").deliveryNoticeReceiptSchema
>;
