import type { Db } from "mongodb";
import { storyCollections } from "./conts";
/**
 * Создаёт уникальность операции автора и storage-ключа, а также индексы lease и активных
 * историй; ошибки индексации прерывают инициализацию.
 */
export const ensureStoriesIndexes = async (db: Db) => {
  await db
    .collection(storyCollections.uploads)
    .createIndexes([
      { key: { actorId: 1, operationId: 1 }, unique: true },
      { key: { profile: 1, key: 1 }, unique: true },
      { key: { "status.state": 1, leaseUntil: 1, updatedAt: 1 } },
    ]);
  await db
    .collection(storyCollections.stories)
    .createIndex({ actorId: 1, state: 1, expiresAt: 1 });
};
