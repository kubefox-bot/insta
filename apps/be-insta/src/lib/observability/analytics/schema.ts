import { canonicalOperationIdSchema } from "@insta/fe-core/observability/contracts";
import { z } from "zod";
import { analyticsSinkNames } from "./conts";
export const referenceSchema = z.strictObject({
  contextId: z.string(),
  revision: z.number().int().positive(),
  policyVersion: z.number().int().positive(),
  generation: z.string(),
});
const deliverySchema = z.object({
  state: z.enum(["pending", "delivered", "denied"]),
  leaseUntil: z.number(),
  nextAttemptAt: z.number(),
  leaseId: z.string().optional(),
});
export const projectionSchema = z.strictObject({
  reference: referenceSchema,
  deliveries: z.strictObject({
    [analyticsSinkNames.logOnly]: deliverySchema,
    otel: deliverySchema,
  }),
});
export const canonicalSchema = z.object({
  analyticsEventId: z.uuid(),
  effectId: z.string(),
  operationId: canonicalOperationIdSchema,
  operation: z.string(),
  code: z.string(),
  authority: z.literal("server_canonical"),
  occurredAt: z.number().nonnegative(),
  projection: projectionSchema,
});
