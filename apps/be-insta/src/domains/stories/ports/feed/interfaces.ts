import type { FeedCursor, FeedPage } from "../../domain/feed/types";
export interface StoryFeed {
  readonly list: (
    input: Readonly<{ now: number; cursor: FeedCursor | null; limit: number }>,
  ) => Promise<FeedPage>;
}
export interface FeedCache {
  readonly read: (
    key: string,
  ) => Promise<Readonly<{ version: string; page: FeedPage | null }>>;
  readonly fill: (
    input: Readonly<{ key: string; version: string; page: FeedPage }>,
  ) => Promise<boolean>;
}
