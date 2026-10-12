import type { Db } from "mongodb";
import { storyPolicy } from "../../domain/conts";
import { encodeFeedCursor } from "../../domain/feed/cursor";
import type { FeedGroup } from "../../domain/feed/types";
import type { StoryFeed } from "../../ports/feed/interfaces";
import { storyCollections } from "./conts";
/** Подключает majority-чтение сгруппированной ленты Stories к заимствованной DB. */
export const createStoryFeed = (db: Db): StoryFeed => ({
  /**
   * Отбирает неистёкшие опубликованные истории, группирует авторов и применяет устойчивую
   * cursor-пагинацию. Дополнительная группа определяет наличие следующей страницы.
   */
  list: async ({ now, cursor, limit }) => {
    const groups = await db
      .collection(storyCollections.stories)
      .aggregate<FeedGroup>(
        [
          { $match: { state: "published", expiresAt: { $gt: now } } },
          { $sort: { "story.publishedAt": 1, _id: 1 } },
          {
            $group: {
              _id: "$actorId",
              author: { $last: "$story.author" },
              latestPublishedAt: { $max: "$story.publishedAt" },
              stories: { $push: "$story" },
            },
          },
          ...(cursor
            ? [
                {
                  $match: {
                    $or: [
                      { latestPublishedAt: { $lt: cursor.latestPublishedAt } },
                      {
                        latestPublishedAt: cursor.latestPublishedAt,
                        _id: { $gt: cursor.authorId },
                      },
                    ],
                  },
                },
              ]
            : []),
          { $sort: { latestPublishedAt: -1, _id: 1 } },
          { $limit: limit + 1 },
          {
            $project: {
              _id: 0,
              author: 1,
              latestPublishedAt: 1,
              stories: { $slice: ["$stories", -storyPolicy.activeLimit] },
            },
          },
        ],
        { readConcern: { level: "majority" } },
      )
      .toArray();
    const authors = groups.slice(0, limit);
    const last = authors.at(-1);
    return {
      authors,
      cursor:
        groups.length > limit && last
          ? encodeFeedCursor({
              latestPublishedAt: last.latestPublishedAt,
              authorId: last.author.id,
            })
          : null,
    };
  },
});
