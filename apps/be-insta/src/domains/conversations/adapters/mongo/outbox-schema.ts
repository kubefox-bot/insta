import { z } from "zod";
import { projectionSchema } from "../../../../lib/observability/analytics/index";
import { messageSent } from "../../business/catalog";
import { recoveryTargetSchema } from "./delivery/schema";

const deliverySchema = z.strictObject({
  state: z.enum(["pending", "delivered"]),
  attempts: z.number().int().nonnegative(),
  leaseUntil: z.number().nonnegative(),
  nextAttemptAt: z.number().nonnegative(),
  leaseId: z.string().optional(),
  deliveredAt: z.number().nonnegative().optional(),
});
export const outboxDocumentSchema = z.strictObject({
  _id: z.string(),
  eventId: z.string(),
  analyticsEventId: z.string(),
  kind: z.literal(messageSent.kind),
  operation: z.literal(messageSent.operation),
  authority: z.literal(messageSent.authority),
  operationId: z.string(),
  messageId: z.string(),
  conversationId: z.string(),
  actorId: z.string(),
  sequence: z.number().int().positive(),
  createdAt: z.number().nonnegative(),
  code: z.literal("MESSAGE_PERSISTED").optional(),
  goal: z.literal("message_sent").optional(),
  effectId: z.string().optional(),
  occurredAt: z.number().nonnegative().optional(),
  projection: projectionSchema.optional(),
  recoveryExpiresAt: z.date().optional(),
  recoveryTargets: z.array(recoveryTargetSchema).optional(),
  deliveries: z.strictObject({
    realtime: deliverySchema.extend({
      state: z.enum(["pending", "delivered", "expired"]),
      recoveryExpiredAt: z.number().nonnegative().optional(),
    }),
    analytics: deliverySchema,
  }),
});
