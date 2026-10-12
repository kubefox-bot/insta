import { z } from "zod";
import { AuthErrorCode } from "../auth/index";
import { CommonErrorCode, correlationSchema } from "../http/index";
import { RealtimeErrorCode } from "./codes";
import { conversationSelectionSchema } from "./command.dto";
import { realtimeKinds, realtimeProtocolVersion } from "./conts";
import { preparedSubscriptionSchema } from "./delivery-position.dto";

const errorSchema = z.strictObject({
  code: z.enum([
    CommonErrorCode.ValidationFailed,
    CommonErrorCode.Forbidden,
    AuthErrorCode.SessionRevoked,
    CommonErrorCode.InternalError,
    RealtimeErrorCode.UnsupportedCommand,
    RealtimeErrorCode.RateLimited,
    RealtimeErrorCode.ServiceUnavailable,
    RealtimeErrorCode.ResyncRequired,
    RealtimeErrorCode.ProtocolUnsupported,
    RealtimeErrorCode.DeliveryBlocked,
  ]),
  message: z.string().min(1),
});
export const ackSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    version: z.literal(realtimeProtocolVersion),
    kind: z.literal(realtimeKinds.ack),
    ok: z.literal(true),
    data: z.union([
      conversationSelectionSchema,
      preparedSubscriptionSchema,
      preparedSubscriptionSchema.extend({
        conversationId: conversationSelectionSchema.shape.conversationId,
      }),
      preparedSubscriptionSchema.extend({
        subscription: z.enum(["unread", "stories"]),
      }),
      z.strictObject({
        subscription: z.enum(["unread", "stories"]),
        subscribed: z.literal(false),
      }),
    ]),
    meta: correlationSchema,
  }),
  z.strictObject({
    version: z.literal(realtimeProtocolVersion),
    kind: z.literal(realtimeKinds.ack),
    ok: z.literal(false),
    error: errorSchema,
    meta: correlationSchema,
  }),
]);
