import type { RedisClient } from "bun";
import type { FeedCache } from "../../../ports/feed/interfaces";
import { fillCachedPage } from "./fill";
import { readCachedPage } from "./read";
/**
 * Связывает versioned cache с заимствованным Redis-клиентом, не меняя владение его
 * соединением.
 */
export const createFeedCache = (client: RedisClient): FeedCache => ({
  /**
   * Передаёт ключ страницы атомарному versioned чтению; недоступность не маскирует на
   * уровне адаптера.
   */
  read: (key) => readCachedPage({ client, key }),
  /**
   * Передаёт страницу и прочитанную версию CAS-заполнению, чтобы конкурентная инвалидация
   * не воскресила старую ленту.
   */
  fill: (input) => fillCachedPage({ client, ...input }),
});
