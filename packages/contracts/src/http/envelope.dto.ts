import { z } from "zod";
import { CommonErrorCode } from "./codes";
import { correlationSchema } from "./correlation.dto";
export const internalErrorSchema = z.strictObject({
  code: z.literal(CommonErrorCode.InternalError),
  message: z.string().min(1),
});
export const validationErrorSchema = z.strictObject({
  code: z.literal(CommonErrorCode.ValidationFailed),
  message: z.string().min(1),
  details: z.strictObject({
    issues: z.array(
      z.strictObject({
        path: z.array(z.union([z.string(), z.number()])),
        code: z.string(),
        message: z.string(),
      }),
    ),
  }),
});
export const commonErrorSchema = z.discriminatedUnion("code", [
  internalErrorSchema,
  validationErrorSchema,
]);
/** Собирает строгий wire envelope с ветвями success/error по ok и общими correlation meta, используя переданные схемы payload. */
export const envelopeSchema = <Data extends z.ZodType, Error extends z.ZodType>(
  dataSchema: Data,
  errorSchema: Error,
) =>
  z.discriminatedUnion("ok", [
    z.strictObject({
      ok: z.literal(true),
      data: dataSchema,
      meta: correlationSchema,
    }),
    z.strictObject({
      ok: z.literal(false),
      error: errorSchema,
      meta: correlationSchema,
    }),
  ]);
