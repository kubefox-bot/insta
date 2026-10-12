import type { Result } from "@bloodyowl/boxed";
import type { QueueError } from "../../../domain/types";
export type TransactionRunner = <T>(
  mode: IDBTransactionMode,
  execute: (
    store: IDBObjectStore,
    complete: (result: Result<T, QueueError>) => void,
  ) => void,
  options?: Readonly<{ signal?: AbortSignal }>,
) => Promise<Result<T, QueueError>>;
