import { Result } from "@bloodyowl/boxed";
import type { TransactionRunner } from "../types";

export const createFactory = () => {
  const requests: IDBOpenDBRequest[] = [];
  const factory = Object.assign({} as IDBFactory, {
    open: () => {
      // Only open event handlers are exercised by this controlled native boundary.
      const request = {} as IDBOpenDBRequest;
      requests.push(request);
      return request;
    },
  });
  return { factory, requests };
};
export const createDatabase = () => {
  const counts = { closes: 0, transactions: 0 };
  const database = Object.assign({} as IDBDatabase, {
    close: () => counts.closes++,
    transaction: () => {
      if (counts.closes) throw Error("Closed database used");
      counts.transactions++;
      const transaction = Object.assign({} as IDBTransaction, {
        objectStore: () => ({}),
      });
      queueMicrotask(() =>
        transaction.oncomplete?.call(transaction, new Event("complete")),
      );
      return transaction;
    },
  });
  return { database, counts };
};
export const succeed = (request: IDBOpenDBRequest, database: IDBDatabase) => {
  Object.defineProperty(request, "result", { value: database });
  request.onsuccess?.call(request, new Event("success"));
};
export const run = (runner: TransactionRunner) =>
  runner("readonly", (_store, complete) => complete(Result.Ok("done"))).then(
    (result) => (result.isOk() ? result.get() : result.getError()),
  );
