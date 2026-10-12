import type { Db } from "mongodb";
import { sessionCollection } from "../../conts";
import type { SessionStore } from "../../ports/store";
import type { Binding } from "../../types";
import { createRefreshStore } from "./refresh";
import { createRevocationStore } from "./revocation";
/** Соединяет CRUD, refresh и revocation над заимствованной Mongo collection. Клиент не создаётся и не закрывается; конкуренция управляется фильтрами отдельных записей, общей транзакции здесь нет. */
export const createMongoSessionStore = (
  db: Db,
  collectionName = sessionCollection,
): SessionStore => {
  const records = db.collection<Binding>(collectionName);
  return {
    /** Сохраняет новую привязку одной вставкой; duplicate key и прочие ошибки Mongo передаются вызывающему сценарию. */
    create: async (binding) => {
      await records.insertOne(binding);
    },
    /** Читает привязку по bindingId: отсутствие возвращается как null, ошибка Mongo отклоняет Promise. */
    read: (bindingId) => records.findOne({ bindingId }),
    /** Блокирует запись только при совпадении bindingId и backendSessionId, не затрагивая другую backend identity; отсутствие совпадения не считается исключением. */
    block: async ({ bindingId, backendSessionId }) => {
      await records.updateOne(
        { bindingId, backendSessionId },
        { $set: { blocked: true } },
      );
    },
    ...createRefreshStore(records),
    ...createRevocationStore(records),
  };
};
/** Создаёт уникальность bindingId, TTL по cleanupAt и индекс очереди отзыва в стандартной collection. Заимствованный Db остаётся у composition; ошибки индексации пробрасываются. */
export const ensureSessionIndexes = async (db: Db) => {
  await db
    .collection(sessionCollection)
    .createIndex({ bindingId: 1 }, { unique: true });
  await db
    .collection(sessionCollection)
    .createIndex({ cleanupAt: 1 }, { expireAfterSeconds: 0 });
  await db
    .collection(sessionCollection)
    .createIndex({ "revocation.nextAttemptAt": 1 });
};
