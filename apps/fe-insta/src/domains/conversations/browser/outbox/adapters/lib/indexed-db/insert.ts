import { Result } from "@bloodyowl/boxed";
import { MessageErrorCode } from "@insta/contracts/errors";
import { outboxOwnerIndex, queueLimit } from "../../../domain/conts";
import type { Queue } from "../../../ports/queue";
import { persistedRecordSchema } from "./record";
import type { TransactionRunner } from "./types";
import { writeRequest } from "./write";
/** Создаёт вставку с проверкой схемы и лимита очереди владельца внутри одной транзакции; подтверждение ждёт её завершения. */
export const createInsert =
  (run: TransactionRunner): Queue["insert"] =>
  (record) =>
    run("readwrite", (store, complete) => {
      const valid = persistedRecordSchema.safeParse(record, { jitless: true });
      if (!valid.success) {
        complete(Result.Error(MessageErrorCode.InvalidMessage));
        store.transaction.abort();
        return;
      }
      const count = store.index(outboxOwnerIndex).count(record.ownerId);
      count.onsuccess = () => {
        if (count.result >= queueLimit) {
          complete(Result.Error("QUEUE_FULL"));
          return;
        }
        writeRequest({
          transaction: store.transaction,
          complete,
          /** Добавляет проверенную запись и передаёт успешный результат запросу транзакции после IDB success. */
          execute: () => {
            const add = store.add(valid.data);
            add.onsuccess = () => complete(Result.Ok(valid.data));
          },
        });
      };
    });
