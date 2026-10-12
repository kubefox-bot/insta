import { correlationSchema } from "@insta/contracts/http";
import { messageSchema } from "@insta/contracts/messages";
import { z } from "zod";
import { sequenceSchema } from "../../../domain/history/cursor";
import { conversationPolicy } from "../../../domain/policy";
import { maxCursorLength } from "../conts";
import { sequenceQuerySchema } from "./query";
export const historyQuerySchema = z
  .strictObject({
    cursor: z.string().min(1).max(maxCursorLength).optional(),
    after: sequenceQuerySchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(conversationPolicy.maxHistoryLimit)
      .default(conversationPolicy.defaultHistoryLimit),
  })
  .refine((input) => !(input.cursor !== undefined && input.after !== undefined))
  .refine(
    (input) =>
      input.cursor !== undefined ||
      input.after !== undefined ||
      input.limit === conversationPolicy.initialHistoryLimit,
    { path: ["limit"] },
  );
export const historyMessageSchema = messageSchema;
export const historySuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    items: z.array(historyMessageSchema),
    pageInfo: z.strictObject({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
    baselineCursor: sequenceSchema,
    watermark: sequenceSchema,
  }),
  meta: correlationSchema,
});
