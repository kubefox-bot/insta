import { feedPolicy } from "./conts";
import { decodeFeedCursor } from "./cursor";
import type { FeedInput } from "./types";
/**
 * Проверяет cursor и допустимое число авторов, затем формирует ключ страницы кэша;
 * неверный запрос возвращает null.
 */
export const feedQuery = (input: FeedInput) => {
  const cursor = input.cursor ? decodeFeedCursor(input.cursor) : null;
  const limit = input.limit ?? feedPolicy.authorsPerPage;
  if (
    (input.cursor && !cursor) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > feedPolicy.authorsPerPage
  )
    return null;
  return { cursor, limit, key: `${limit}:${input.cursor ?? "first"}` };
};
