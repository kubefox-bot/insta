export type FeedAuthor = Readonly<{ id: string; username: string }>;
export type FeedStory = Readonly<{
  id: string;
  author: FeedAuthor;
  publishedAt: number;
  expiresAt: number;
  durationMs: number;
}>;
export type FeedGroup = Readonly<{
  author: FeedAuthor;
  latestPublishedAt: number;
  stories: readonly FeedStory[];
}>;
export type FeedPage = Readonly<{
  authors: readonly FeedGroup[];
  cursor: string | null;
}>;
export type FeedSnapshot =
  | Readonly<{ kind: "ready"; page: FeedPage }>
  | Readonly<{ kind: "unavailable" }>;
