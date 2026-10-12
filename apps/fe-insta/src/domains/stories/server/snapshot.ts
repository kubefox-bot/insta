import { readPublicFeed } from "../adapters/http/public-response/read";
import type { FeedSnapshot } from "../domain/feed/types";
/** Загружает и проверяет публичный снимок ленты для SSR; ошибка транспорта или схемы становится состоянием unavailable. */
export const loadFeedSnapshot = async (
  read: () => Promise<Response>,
): Promise<FeedSnapshot> => {
  try {
    return { kind: "ready", page: await readPublicFeed(await read()) };
  } catch {
    return { kind: "unavailable" };
  }
};
