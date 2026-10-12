import { Result } from "@bloodyowl/boxed";
import type { QueueError } from "../../../domain/types";
/** Выполняет IDB-запись; синхронный сбой фиксирует как persistence-ошибку и прерывает транзакцию. */
export const writeRequest = <T>({
  transaction,
  execute,
  complete,
}: Readonly<{
  transaction: IDBTransaction;
  execute: () => void;
  complete: (result: Result<T, QueueError>) => void;
}>) => {
  try {
    execute();
  } catch {
    complete(Result.Error("PERSISTENCE_FAILED"));
    transaction.abort();
  }
};
