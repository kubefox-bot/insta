import { PrivacyErrorCode } from "@insta/contracts/errors";
import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import {
  publicPreferenceSchema,
  saveChoiceSchema,
} from "@insta/contracts/privacy";
import { z } from "zod";

export { saveChoiceSchema };

const nativePreferenceSchema = publicPreferenceSchema.extend({
  needsChoice: z.boolean(),
});
export const readSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: nativePreferenceSchema,
  meta: correlationSchema,
});
export const saveSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    state: nativePreferenceSchema,
    contextProof: z.string(),
    expiresAt: z.number(),
  }),
  meta: correlationSchema,
});
export const consentFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.union([
    z.strictObject({ code: z.enum(PrivacyErrorCode), message: z.string() }),
    internalErrorSchema,
    validationErrorSchema,
  ]),
  meta: correlationSchema,
});
