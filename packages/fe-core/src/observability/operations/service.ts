import { Result } from "@bloodyowl/boxed";
import { buildExceptionLog } from "../builders/builders";
import type { LogRecord } from "../contracts/types";
import { whitelistRecord } from "../contracts/whitelist";
import type {
  ObservabilityService,
  ObservabilityServiceOptions,
} from "../types";
import { Operation } from "./operation";
/** Создаёт неизменяемый фасад операций и best-effort доставки; перед каждым адаптером применяет allowlist и выделяет отдельную JSON-копию записи. */
export const createObservabilityService = (
  options: ObservabilityServiceOptions,
): ObservabilityService => {
  /** Фильтрует запись и изолирует адаптеры друг от друга; boolean отражает фильтрацию и синхронные отказы, но не подтверждает асинхронную доставку. */
  const emit = (record: LogRecord): boolean => {
    const safe = Result.fromExecution(() =>
      whitelistRecord({ input: record, identity: options.identity }),
    );
    if (safe.isError()) return false;
    const encoded = JSON.stringify(safe.get());
    let delivered = true;
    for (const adapter of options.adapters ?? []) {
      const invoked = Result.fromExecution(() => {
        const copy: LogRecord = JSON.parse(encoded);
        return typeof adapter === "function"
          ? adapter(copy)
          : adapter.emit(copy);
      });
      if (invoked.isError()) delivered = false;
      else void Result.fromPromise(Promise.resolve(invoked.get()));
    }
    return delivered;
  };
  return Object.freeze({
    /** Создаёт отдельное состояние именованной операции с общими провайдерами времени, корреляции и доставки. */
    operation: (name: string) => new Operation(name, options, emit),
    emit,
    /** Строит безопасную запись исключения и передаёт её адаптерам; ошибка построения возвращает false. */
    exception: (error: unknown, details = {}) => {
      const built = Result.fromExecution(() =>
        buildExceptionLog({
          identity: options.identity,
          exception: error,
          ...details,
        }),
      );
      return built.isOk() ? emit(built.get()) : false;
    },
  });
};
