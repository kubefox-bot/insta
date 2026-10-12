import type { FeedPage } from "../../../domain/feed/types";
import type { FeedCache } from "../../../ports/feed/interfaces";
/**
 * Пытается заполнить кэш только при известной версии snapshot; отказ CAS или storage
 * отключает оптимизацию, не отменяя страницу Mongo.
 */
export const fillFeedCache = async (
  input: Readonly<{
    cache: FeedCache;
    key: string;
    page: FeedPage;
    snapshot: Awaited<ReturnType<FeedCache["read"]>> | null;
  }>,
) => {
  if (!input.snapshot) return false;
  // Failure only disables this optimization. Mongo's page remains authoritative.
  return input.cache
    .fill({ key: input.key, page: input.page, version: input.snapshot.version })
    .catch(() => false);
};
