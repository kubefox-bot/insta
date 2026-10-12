import type { RedisClient } from "bun";
import { feedPolicy } from "../../../domain/feed/conts";
import type { FeedCache } from "../../../ports/feed/interfaces";
import { feedCacheKeys, fillFeedLua } from "../conts";
import { cacheSchema } from "./schema";
/**
 * Валидирует страницу и записывает её с TTL лишь при совпадении текущей версии;
 * проигранный CAS возвращает false.
 */
export const fillCachedPage = async ({
  client,
  key,
  version,
  page,
}: Readonly<{ client: RedisClient }> & Parameters<FeedCache["fill"]>[0]) =>
  (await client.send("EVAL", [
    fillFeedLua,
    "2",
    feedCacheKeys.version,
    `${feedCacheKeys.page}${key}:`,
    version,
    JSON.stringify(cacheSchema.parse({ version, page })),
    String(feedPolicy.cacheMs),
  ])) === 1;
