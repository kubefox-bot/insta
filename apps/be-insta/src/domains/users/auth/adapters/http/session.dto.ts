import { AuthErrorCode } from "@insta/contracts/errors";

import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import { z } from "zod";
import { passwordLimits } from "../../../domain/conts";
import { validPassword } from "../../../domain/policy";
import {
  publicUserSchema,
  refreshCredentialsSchema,
  refreshProofSchema,
  sessionCredentialsSchema,
} from "../../domain/credentials";
import { maximumIdempotencyLength } from "./conts";

const passwordSchema = z
  .string()
  .refine(validPassword)
  .meta({
    minLength: passwordLimits.minCodePoints,
    maxLength: passwordLimits.maxCodePoints,
    // This scalar atom works with both Unicode and legacy ECMA regex modes.
    pattern: `^(?:[^\\uD800-\\uDFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]){${passwordLimits.minCodePoints},${passwordLimits.maxCodePoints}}(?![\\s\\S])`,
  });
export const loginSchema = z.strictObject({
  email: z.email(),
  password: passwordSchema,
});
export const refreshSchema = z.strictObject({
  refreshToken: refreshProofSchema,
});
export const revokeSchema = z.strictObject({
  backendSessionId: z.uuid(),
  revokeSecret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const idempotencySchema = z
  .string()
  .min(1)
  .max(maximumIdempotencyLength)
  .regex(/^[A-Za-z0-9_-]+$/)
  .optional();
export const loginSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: sessionCredentialsSchema,
  meta: correlationSchema,
});
export const refreshSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: refreshCredentialsSchema,
  meta: correlationSchema,
});
export const terminalSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({ state: z.enum(["revoked", "expired"]) }),
  meta: correlationSchema,
});
export const meSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: publicUserSchema,
  meta: correlationSchema,
});
export const authFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.union([
    validationErrorSchema,
    internalErrorSchema,
    z.strictObject({
      code: z.enum(AuthErrorCode),
      message: z.string(),
    }),
  ]),
  meta: correlationSchema,
});
