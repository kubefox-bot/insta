import { storyWireLimits } from "@insta/contracts/stories";
import { z } from "zod";
import { mediaProtocols, publicFeedLimits } from "./conts";

const authorSchema = z.strictObject({
  id: z.string().min(1),
  username: z.string().min(1),
});
export const storySchema = z
  .strictObject({
    id: z.string().min(1),
    author: authorSchema,
    publishedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    durationMs: z.number().positive().max(storyWireLimits.maxDurationMs),
  })
  .refine((story) => story.expiresAt > story.publishedAt);
const groupSchema = z
  .strictObject({
    author: authorSchema,
    latestPublishedAt: z.number().int().nonnegative(),
    stories: z.array(storySchema).min(1).max(publicFeedLimits.stories),
  })
  .refine((group) =>
    group.stories.every(
      (story) =>
        story.author.id === group.author.id &&
        story.author.username === group.author.username,
    ),
  );
const metaSchema = z.strictObject({
  requestId: z.string(),
  operationId: z.string().optional(),
});
const feedSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    authors: z.array(groupSchema).max(publicFeedLimits.authors),
    cursor: z.string().min(1).nullable(),
  }),
  meta: metaSchema,
});
const playbackSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    url: z.url().refine((value) => {
      const url = new URL(value);
      return (
        mediaProtocols.some((protocol) => protocol === url.protocol) &&
        !url.username &&
        !url.password
      );
    }),
    expiresAt: z.number().int().positive(),
  }),
  meta: metaSchema,
});
/** Проверяет публичную ленту строгой схемой, включая авторов и сроки Stories; у неуспешного ответа отменяет тело и выбрасывает ошибку. */
export const readPublicFeed = async (response: Response) => {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Stories feed unavailable");
  }
  return feedSchema.parse(await response.json()).data;
};
/** Проверяет публичную ссылку и срок воспроизведения, допуская только разрешённые протоколы без credentials; неуспешное тело отменяет. */
export const readPublicPlayback = async (response: Response) => {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Story playback unavailable");
  }
  return playbackSchema.parse(await response.json()).data;
};
