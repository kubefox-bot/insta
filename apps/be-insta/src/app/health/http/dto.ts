import { CommonErrorCode } from "@insta/contracts/errors";
import { correlationSchema, internalErrorSchema } from "@insta/contracts/http";
import { z } from "zod";
export const healthSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({ status: z.literal("ok") }),
  meta: correlationSchema,
});
export const healthFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: internalErrorSchema,
  meta: correlationSchema,
});
export const healthReadySchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    status: z.literal("ok"),
    mail: z.enum(["ok", "degraded"]),
    delivery: z.enum(["ok", "degraded"]),
  }),
  meta: correlationSchema,
});
export const healthUnavailableSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: z.literal(CommonErrorCode.DependencyUnavailable),
    message: z.string(),
  }),
  meta: correlationSchema,
});
