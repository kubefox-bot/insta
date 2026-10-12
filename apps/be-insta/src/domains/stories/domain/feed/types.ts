import type { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import type { PublicAuthor, PublishedStory } from "../types";
export type FeedCursor = Readonly<{
  latestPublishedAt: number;
  authorId: string;
}>;
export type FeedGroup = Readonly<{
  author: PublicAuthor;
  latestPublishedAt: number;
  stories: readonly PublishedStory[];
}>;
export type FeedPage = Readonly<{
  authors: readonly FeedGroup[];
  cursor: string | null;
}>;
export type FeedInput = Readonly<{
  now: number;
  cursor?: string | undefined;
  limit?: number | undefined;
}>;
export type FeedError =
  | CommonErrorCode.InvalidCursor
  | StoryErrorCode.Busy
  | CommonErrorCode.DependencyUnavailable;
