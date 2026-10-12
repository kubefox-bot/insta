import { usernameCharacters } from "@insta/contracts/auth";
import { RegistrationErrorCode } from "@insta/contracts/errors";
import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import { z } from "zod";
import { usernameLimits } from "../../../domain/conts";
import { authHttpErrors } from "../../../http/conts";
import { otpPolicy } from "../../domain/registration/conts";
import { maximumRegistrationProofLength } from "./conts";
import { loginSchema } from "./session.dto";
export const registrationStartSchema = z.strictObject({
  email: z.email(),
  operationId: correlationSchema.shape.operationId.unwrap(),
});
export const registrationVerifySchema = z.strictObject({
  challengeId: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().regex(new RegExp(`^[0-9]{${otpPolicy.digits}}$`)),
});
export const registrationCompleteSchema = z.strictObject({
  proof: z.string().min(1).max(maximumRegistrationProofLength),
  username: z
    .string()
    .min(usernameLimits.min)
    .max(usernameLimits.max)
    .regex(usernameCharacters),
  password: loginSchema.shape.password,
  operationId: correlationSchema.shape.operationId.unwrap(),
});
export const registrationStartSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    challengeId: z.string(),
    registrationExpiresAt: z.number().int(),
  }),
  meta: correlationSchema,
});
export const registrationVerifySuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.union([
    z.strictObject({ status: z.literal("login_required") }),
    z.strictObject({
      status: z.literal("pending_setup"),
      registrationProof: z.string(),
      expiresAt: z.number().int(),
    }),
  ]),
  meta: correlationSchema,
});
export const registrationFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.union([
    validationErrorSchema,
    internalErrorSchema,
    z.strictObject({
      code: z.enum({
        expired: RegistrationErrorCode.RegistrationExpired,
        invalidCode: RegistrationErrorCode.CodeInvalid,
        exhausted: RegistrationErrorCode.CodeExhausted,
        cooldown: RegistrationErrorCode.ResendCooldown,
        reconfirm: RegistrationErrorCode.ReconfirmEmail,
        invalidProof: RegistrationErrorCode.RegistrationProofInvalid,
        usernameTaken: RegistrationErrorCode.UsernameTaken,
        conflict: RegistrationErrorCode.RegistrationConflict,
        unavailable: RegistrationErrorCode.RegistrationUnavailable,
        busy: authHttpErrors.busy.code,
        limited: authHttpErrors.limited.code,
        limitsUnavailable: authHttpErrors.unavailable.code,
      }),
      message: z.string(),
    }),
  ]),
  meta: correlationSchema,
});
