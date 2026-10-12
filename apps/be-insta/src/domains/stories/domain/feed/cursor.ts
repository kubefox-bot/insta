import { z } from "zod";
import { feedPolicy } from "./conts";
import type { FeedCursor } from "./types";

const cursorSchema = z.strictObject({
  latestPublishedAt: z.number().int().nonnegative(),
  authorId: z.string().min(1).max(feedPolicy.cursorBytes),
});
/** Кодирует позицию автора и времени публикации в base64url JSON для следующей страницы. */
export const encodeFeedCursor = (cursor: FeedCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");
/**
 * Принимает только ограниченный по длине канонический cursor с валидной схемой; ошибки
 * декодирования возвращает как null.
 */
export const decodeFeedCursor = (cursor: string): FeedCursor | null => {
  if (
    cursor.length > feedPolicy.cursorBytes ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  )
    return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString()),
    );
    return parsed.success && encodeFeedCursor(parsed.data) === cursor
      ? parsed.data
      : null;
  } catch {
    return null;
  }
};
