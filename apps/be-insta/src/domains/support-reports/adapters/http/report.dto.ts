import { SupportErrorCode } from "@insta/contracts/errors";
import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import { z } from "zod";
import { supportPolicy } from "../../domain/conts";
export const reportSchema = z.strictObject({
  comment: z
    .string()
    .min(1)
    .max(supportPolicy.commentCodePoints * 2)
    .regex(
      new RegExp(
        `^(?:[^\\uD800-\\uDFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]){1,${supportPolicy.commentCodePoints}}(?![\\s\\S])`,
      ),
    ),
  errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  originalRequestId: correlationSchema.shape.requestId.optional(),
  guestContext: z.string().max(supportPolicy.proofMaximumLength).optional(),
});
export const reportKeySchema = z
  .string()
  .min(1)
  .max(supportPolicy.keyMaximumLength)
  .regex(/^[A-Za-z0-9_-]+$/)
  .optional();
export const contextSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({ proof: z.string(), expiresAt: z.number() }),
  meta: correlationSchema,
});
export const reportSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    reportId: z.uuid(),
    emailState: z.enum(["pending", "accepted", "failed"]),
  }),
  meta: correlationSchema,
});
export const supportFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.union([
    validationErrorSchema,
    internalErrorSchema,
    z.strictObject({ code: z.enum(SupportErrorCode), message: z.string() }),
  ]),
  meta: correlationSchema,
});
