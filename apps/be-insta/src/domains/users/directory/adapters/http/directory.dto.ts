import { CommonErrorCode, DirectoryErrorCode } from "@insta/contracts/errors";
import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import { z } from "zod";
import { directoryPolicy } from "../../domain/conts";
export const directoryQuerySchema = z.strictObject({
  q: z
    .string()
    .min(directoryPolicy.minQueryLength)
    .max(directoryPolicy.maxQueryLength),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(directoryPolicy.maxLimit)
    .default(directoryPolicy.defaultLimit),
});
export const publicDirectoryUserSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  username: z.string(),
});
export const directorySuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({ items: z.array(publicDirectoryUserSchema) }),
  meta: correlationSchema,
});
export const directoryFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.union([
    internalErrorSchema,
    validationErrorSchema,
    z.strictObject({
      code: z.enum([
        DirectoryErrorCode.UserNotFound,
        DirectoryErrorCode.DirectoryRateLimited,
        CommonErrorCode.DependencyUnavailable,
      ]),
      message: z.string(),
    }),
  ]),
  meta: correlationSchema,
});
