import type { RedisClient } from "bun";
import { z } from "zod";
import { feedCacheKeys, readFeedLua } from "../conts";
import { cacheSchema } from "./schema";
/**
 * Атомарно читает/инициализирует версию и страницу кэша, валидирует JSON и возвращает
 * страницу лишь при совпадении версии; ошибки остаются у вызывающего fallback.
 */
export const readCachedPage = async ({
  client,
  key,
}: Readonly<{ client: RedisClient; key: string }>) => {
  const [version, raw] = z
    .tuple([z.string(), z.string()])
    .parse(
      await client.send("EVAL", [
        readFeedLua,
        "2",
        feedCacheKeys.version,
        `${feedCacheKeys.page}${key}:`,
        crypto.randomUUID(),
      ]),
    );
  const cached = raw ? cacheSchema.parse(JSON.parse(raw)) : null;
  return { version, page: cached?.version === version ? cached.page : null };
};
