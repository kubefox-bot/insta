import type { FeedGroup, FeedPage } from "./types";
/** Объединяет страницы по авторам и id Stories, исключает истёкшие записи и стабильно сортирует ленту; при дублях сохраняет ранее накопленную запись. */
export const mergeFeedPages = ({
  pages,
  now,
}: Readonly<{
  pages: readonly FeedPage[];
  now: number;
}>): readonly FeedGroup[] => {
  const authors = new Map<string, FeedGroup>();
  for (const page of pages)
    for (const group of page.authors) {
      const existing = authors.get(group.author.id);
      const stories = new Map(
        [...group.stories, ...(existing?.stories ?? [])]
          .filter((story) => story.expiresAt > now)
          .map((story) => [story.id, story]),
      );
      if (!stories.size) continue;
      const ordered = [...stories.values()].sort(
        (left, right) =>
          left.publishedAt - right.publishedAt ||
          left.id.localeCompare(right.id),
      );
      authors.set(group.author.id, {
        author: existing?.author ?? group.author,
        latestPublishedAt: Math.max(
          ...ordered.map((story) => story.publishedAt),
        ),
        stories: ordered,
      });
    }
  return [...authors.values()].sort(
    (left, right) =>
      right.latestPublishedAt - left.latestPublishedAt ||
      left.author.id.localeCompare(right.author.id),
  );
};
