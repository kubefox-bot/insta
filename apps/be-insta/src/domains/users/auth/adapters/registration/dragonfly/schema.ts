import { RegistrationErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
export const storedChallengeSchema = z.strictObject({
  challengeId: z.string(),
  registrationExpiresAt: z.number(),
  nextSendAt: z.number(),
  errors: z.number().int(),
  version: z.string(),
  consumed: z.boolean(),
  codeDigest: z.string(),
  ciphertext: z.string(),
  revision: z.number().int(),
});
export const errorSchema = z.enum([
  RegistrationErrorCode.RegistrationExpired,
  RegistrationErrorCode.CodeInvalid,
  RegistrationErrorCode.CodeExhausted,
  RegistrationErrorCode.ResendCooldown,
  RegistrationErrorCode.RegistrationConflict,
]);
