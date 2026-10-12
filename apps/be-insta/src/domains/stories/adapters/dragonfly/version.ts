import type { RedisClient } from "bun";
import { feedCacheKeys } from "./conts";
/**
 * Создаёт инвалидацию ленты заменой общего version UUID; старые страницы становятся
 * недоступны по новой версии без массового удаления ключей.
 */
export const createFeedInvalidation = (client: RedisClient) => async () => {
  await client.set(feedCacheKeys.version, crypto.randomUUID());
};
