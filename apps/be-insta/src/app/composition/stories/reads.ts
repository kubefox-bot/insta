import type { RedisClient } from "bun";
import {
  createFeedReader,
  type StoryDependencies,
} from "../../../domains/stories/index";
import {
  createFeedCache,
  type createStoriesPersistence,
} from "../../../domains/stories/server/index";
import { createStoryQuotas } from "./quotas";
/** Assembles the public feed and request quotas independently of publication lifetime. */
export const createStoryReads = ({
  persistence,
  broker,
  authors,
  quotaKey,
  clock,
}: Readonly<{
  persistence: Awaited<ReturnType<typeof createStoriesPersistence>>;
  broker: RedisClient;
  authors: StoryDependencies["authors"];
  quotaKey: string;
  clock: () => number;
}>) => ({
  feed: createFeedReader({
    stories: persistence.feed,
    cache: createFeedCache(broker),
    authors,
    clock,
  }),
  quotas: createStoryQuotas({ client: broker, key: quotaKey }),
});
