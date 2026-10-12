import { Result } from "@bloodyowl/boxed";
import { outboxOwnerIndex } from "../../../domain/conts";
import type { Queue } from "../../../ports/queue";
import type { TransactionRunner } from "./types";
/** Создаёт транзакционное удаление записей одного владельца по индексу, сохраняя очереди остальных пользователей. */
export const createClear =
  (run: TransactionRunner): Queue["clear"] =>
  (ownerId) =>
    run("readwrite", (store, complete) => {
      const request = store
        .index(outboxOwnerIndex)
        .openKeyCursor(IDBKeyRange.only(ownerId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          complete(Result.Ok(undefined));
          return;
        }
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
    });
