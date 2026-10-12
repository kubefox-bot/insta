import { Result } from "@bloodyowl/boxed";
import type {
  BusinessDiagnosticRecord,
  BusinessObserverOptions,
} from "./types";

/** Вызывает diagnostic emit синхронно, изолируя синхронный и асинхронный отказ; доставки не ожидает, чтобы не блокировать бизнес-операцию. */
export const emitDiagnostic = (
  emit: BusinessObserverOptions["emit"],
  record: BusinessDiagnosticRecord,
): void => {
  const invoked = Result.fromExecution(() => emit(record));
  if (invoked.isOk()) {
    // Keep invocation synchronous; diagnostic delivery never blocks business work.
    void Result.fromPromise(Promise.resolve(invoked.get()));
  }
};
