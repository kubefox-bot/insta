import { z } from "zod";
import { idempotencySchema } from "../../../users/http/server";
import { feedPolicy } from "../../domain/feed/conts";
export const operationSchema = idempotencySchema.unwrap();
export const storySchema = z.strictObject({
  id: z.string(),
  author: z.strictObject({ id: z.string(), username: z.string() }),
  publishedAt: z.number(),
  expiresAt: z.number(),
  durationMs: z.number(),
});
const metaSchema = z.strictObject({
  requestId: z.string(),
  operationId: z.string().optional(),
});
export const publicationSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("not_found"), operationId: z.string() }),
  z.strictObject({ state: z.literal("pending"), operationId: z.string() }),
  z.strictObject({
    state: z.literal("failed"),
    operationId: z.string(),
    code: z.string(),
  }),
  z.strictObject({
    state: z.literal("published"),
    operationId: z.string(),
    story: storySchema,
  }),
]);
export const publishSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: storySchema,
  meta: metaSchema,
});
export const publicationSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: publicationSchema,
  meta: metaSchema,
});
export const playbackSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({ url: z.string(), expiresAt: z.number() }),
  meta: metaSchema,
});
export const storyFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({ code: z.string(), message: z.string() }),
  meta: metaSchema,
});
export const feedQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(feedPolicy.cursorBytes).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(feedPolicy.authorsPerPage)
    .optional(),
});
export const feedSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    authors: z.array(
      z.strictObject({
        author: storySchema.shape.author,
        latestPublishedAt: z.number(),
        stories: z.array(storySchema),
      }),
    ),
    cursor: z.string().nullable(),
  }),
  meta: metaSchema,
});
