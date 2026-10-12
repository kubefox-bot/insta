import { DirectoryErrorCode } from "@insta/contracts/errors";
import type { FeedGroup, FeedPage } from "../../../domain/feed/types";
import type { StoryAuthors } from "../../../ports/authors/interfaces";
/**
 * Обновляет публичные данные авторов через порт directory, исключая удалённых
 * пользователей. Недоступность directory прерывает чтение, а не выдаётся за пустую ленту.
 */
export const resolveFeedAuthors = async (
  input: Readonly<{ page: FeedPage; authors: StoryAuthors }>,
): Promise<FeedPage> => {
  const groups: FeedGroup[] = [];
  for (const group of input.page.authors) {
    const author = await input.authors.findPublicUser({ id: group.author.id });
    if (author.isError()) {
      if (author.getError() === DirectoryErrorCode.UserNotFound) continue;
      throw new Error("Story author unavailable");
    }
    const publicAuthor = author.get();
    groups.push({
      ...group,
      author: publicAuthor,
      stories: group.stories.map((story) => ({
        ...story,
        author: publicAuthor,
      })),
    });
  }
  return { authors: groups, cursor: input.page.cursor };
};
