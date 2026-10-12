import { z } from "zod";
import {
  canonicalCorrelation,
  EFFECT_ID_PATTERN,
  SYMBOL_PATTERN,
  UUID_V4_PATTERN,
} from "./conts";

const identifier = z.string().regex(UUID_V4_PATTERN);
const symbol = z.string().regex(SYMBOL_PATTERN);
export const clientGoalSchema = symbol;
export const canonicalOperationIdSchema = z
  .string()
  .min(1)
  .max(canonicalCorrelation.maximumLength)
  .regex(canonicalCorrelation.pattern);
export const analyticsProjectionSchema = z.object({
  analyticsEventId: identifier,
  effectId: z.string().regex(EFFECT_ID_PATTERN),
  operationId: canonicalOperationIdSchema,
  operation: symbol,
  code: symbol,
  authority: z.literal("server_canonical"),
  occurredAt: z.number().finite().nonnegative(),
  goal: symbol,
});
export const clientProjectionSchema = z.object({
  analyticsEventId: identifier,
  operationId: identifier.optional(),
  operation: symbol,
  code: symbol,
  authority: z.literal("client_observed"),
});
