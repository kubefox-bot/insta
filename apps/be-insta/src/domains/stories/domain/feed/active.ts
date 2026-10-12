import type { FeedPage } from "./types";
/**
 * Отбрасывает истёкшие по сохранённому expiresAt истории и пустые группы, сохраняя cursor
 * страницы; входные коллекции не меняет.
 */
export const activeFeed = ({
  page,
  now,
}: Readonly<{ page: FeedPage; now: number }>): FeedPage => ({
  cursor: page.cursor,
  authors: page.authors.flatMap((group) => {
    const stories = group.stories.filter((story) => story.expiresAt > now);
    return stories.length ? [{ ...group, stories }] : [];
  }),
});
