import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import { activeFeed } from "../domain/feed/active";
import { feedPolicy } from "../domain/feed/conts";
import { feedQuery } from "../domain/feed/query";
import type { FeedError, FeedInput, FeedPage } from "../domain/feed/types";
import type { StoryAuthors } from "../ports/authors/interfaces";
import type { FeedCache, StoryFeed } from "../ports/feed/interfaces";
import { resolveFeedAuthors } from "./list-feed/lib/authors";
import { fillFeedCache } from "./list-feed/lib/cache";
/**
 * Создаёт чтение ленты с необязательным кэшем и локальным лимитом одновременных
 * Mongo-запросов. Ошибки кэша используют тот же gate, что и misses; слот освобождается в
 * finally.
 */
export const createFeedReader = (
  dependencies: Readonly<{
    stories: StoryFeed;
    cache: FeedCache;
    authors: StoryAuthors;
    clock?: () => number;
  }>,
) => {
  let reading = 0;
  /**
   * Удаляет истории, истёкшие к моменту выдачи, включая кэшированные страницы; использует
   * clock владельца либо время запроса.
   */
  const active = (page: FeedPage, input: FeedInput) =>
    Result.Ok<FeedPage, FeedError>(
      activeFeed({ page, now: dependencies.clock?.() ?? input.now }),
    );
  return async (input: FeedInput): Promise<Result<FeedPage, FeedError>> => {
    const query = feedQuery(input);
    if (!query) return Result.Error(CommonErrorCode.InvalidCursor);
    const { cursor, limit, key } = query;
    // Cache is an optimization. Failed reads enter the same bounded Mongo gate as misses.
    const cached = await dependencies.cache.read(key).catch(() => null);
    if (cached?.page) return active(cached.page, input);
    if (reading >= feedPolicy.concurrentReads)
      return Result.Error(StoryErrorCode.Busy);
    reading++;
    try {
      const stored = await dependencies.stories.list({
        now: input.now,
        cursor,
        limit,
      });
      const page = await resolveFeedAuthors({
        page: stored,
        authors: dependencies.authors,
      });
      await fillFeedCache({
        cache: dependencies.cache,
        key,
        page,
        snapshot: cached,
      });
      return active(page, input);
    } catch {
      return Result.Error(CommonErrorCode.DependencyUnavailable);
    } finally {
      reading--;
    }
  };
};
