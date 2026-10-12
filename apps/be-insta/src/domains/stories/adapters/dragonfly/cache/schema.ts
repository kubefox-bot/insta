import { z } from "zod";

const authorSchema = z.strictObject({ id: z.string(), username: z.string() });
const storySchema = z.strictObject({
  id: z.string(),
  author: authorSchema,
  publishedAt: z.number(),
  expiresAt: z.number(),
  durationMs: z.number(),
});
const pageSchema = z.strictObject({
  authors: z.array(
    z.strictObject({
      author: authorSchema,
      latestPublishedAt: z.number(),
      stories: z.array(storySchema),
    }),
  ),
  cursor: z.string().nullable(),
});
export const cacheSchema = z.strictObject({
  version: z.string(),
  page: pageSchema,
});
