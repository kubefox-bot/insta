import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { outboxStoreName } from "../../../domain/conts";
import type { QueueError } from "../../../domain/types";
/** Владеет IDB-транзакцией и слушателем отмены; результат запроса публикует лишь по завершению транзакции, abort сохраняет явный отказ. */
export const transact = <T>({
  database,
  mode,
  execute,
  signal,
}: Readonly<{
  database: IDBDatabase;
  mode: IDBTransactionMode;
  execute: (
    store: IDBObjectStore,
    complete: (result: Result<T, QueueError>) => void,
  ) => void;
  signal?: AbortSignal;
}>): Promise<Result<T, QueueError>> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(Result.Error(SessionErrorCode.ActorChanged));
      return;
    }
    const transaction = database.transaction(outboxStoreName, mode);
    let result: Result<T, QueueError> = Result.Error("PERSISTENCE_FAILED");
    /** Пытается прервать транзакцию; если native commit уже завершился, оставляет исход событию завершения, не объявляя эффект отменённым. */
    const cancel = () => {
      try {
        transaction.abort();
      } catch {
        // Native commit already finished; its completion event owns the outcome.
        return;
      }
    };
    /** Снимает слушатель отмены и завершает Promise исходом, определённым событием транзакции. */
    const finish = (outcome: Result<T, QueueError>) => {
      signal?.removeEventListener("abort", cancel);
      resolve(outcome);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    transaction.oncomplete = () => finish(result);
    transaction.onerror = () =>
      finish(
        Result.Error(
          signal?.aborted
            ? SessionErrorCode.ActorChanged
            : "PERSISTENCE_FAILED",
        ),
      );
    transaction.onabort = () => {
      if (signal?.aborted) {
        finish(Result.Error(SessionErrorCode.ActorChanged));
        return;
      }
      finish(result.isError() ? result : Result.Error("PERSISTENCE_FAILED"));
    };
    try {
      execute(transaction.objectStore(outboxStoreName), (value) => {
        result = value;
      });
    } catch {
      transaction.abort();
    }
  });
