import type { Result } from "@bloodyowl/boxed";
import { createRemove } from "../../../src/domains/conversations/browser/outbox/adapters/lib/indexed-db/remove";
import type { TransactionRunner } from "../../../src/domains/conversations/browser/outbox/adapters/lib/indexed-db/types";
import type {
  QueuedMessage,
  QueueError,
} from "../../../src/domains/conversations/browser/outbox/domain/types";

// These callback fakes exercise adapter decisions only; native transaction tests are separate.
const request = <T>(result: T) => {
  const value = { result, onsuccess: null } as IDBRequest<T>;
  queueMicrotask(() => value.onsuccess?.call(value, new Event("success")));
  return value;
};
export const removeSnapshot = async ({
  stored,
  expected,
}: Readonly<{ stored: QueuedMessage; expected: QueuedMessage }>) => {
  const state = { deleted: false };
  const run: TransactionRunner = async <T>(
    _mode: IDBTransactionMode,
    execute: (
      store: IDBObjectStore,
      complete: (result: Result<T, QueueError>) => void,
    ) => void,
  ) => {
    const completed = Promise.withResolvers<Result<T, QueueError>>();
    const store: Partial<IDBObjectStore> = {
      get: () => request(stored),
      delete: () => {
        state.deleted = true;
        return request(undefined);
      },
      transaction: {} as IDBTransaction,
    };
    execute(store as IDBObjectStore, completed.resolve);
    return completed.promise;
  };
  const result = await createRemove(run)(expected);
  return { result, deleted: state.deleted };
};
