import { Result } from "@bloodyowl/boxed";
import type { QueuedMessage, QueueError } from "../../../domain/types";
import type { Queue } from "../../../ports/queue";
import { persistedRecordSchema } from "./record";
import type { TransactionRunner } from "./types";
import { writeRequest } from "./write";

/** Отличает отсутствующую запись от повреждённой и допускает удаление только при совпадении владельца, ревизии и поколения. */
const removable = (
  raw: unknown,
  expected: QueuedMessage,
): Result<boolean, QueueError> => {
  if (raw === undefined) return Result.Ok(false);
  const parsed = persistedRecordSchema.safeParse(raw, { jitless: true });
  return parsed.success
    ? Result.Ok(
        parsed.data.ownerId === expected.ownerId &&
          parsed.data.revision === expected.revision &&
          parsed.data.lastAuthGeneration === expected.lastAuthGeneration,
      )
    : Result.Error("PERSISTENCE_FAILED");
};
/** Создаёт условное удаление операции в одной транзакции; отсутствие или конфликт возвращает false, повреждение — ошибку. */
export const createRemove =
  (run: TransactionRunner): Queue["remove"] =>
  (record) =>
    run("readwrite", (store, complete) => {
      const request = store.get(record.operationId);
      request.onsuccess = () => {
        const allowed = removable(request.result, record);
        if (allowed.isError()) {
          complete(Result.Error(allowed.getError()));
          return;
        }
        if (!allowed.get()) {
          complete(Result.Ok(false));
          return;
        }
        writeRequest({
          transaction: store.transaction,
          complete,
          /** Удаляет проверенную операцию и отмечает результат запроса успешным; окончательное подтверждение остаётся за транзакцией. */
          execute: () => {
            const removed = store.delete(record.operationId);
            removed.onsuccess = () => complete(Result.Ok(true));
          },
        });
      };
    });
