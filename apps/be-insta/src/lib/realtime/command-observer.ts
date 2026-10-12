import { withContext } from "@insta/fe-core/observability/server";
import { createCompletionLog } from "./completion-log";
import { commandObservation } from "./conts";
import type {
  CommandCompletion,
  CommandObserver,
  ObserverDependencies,
} from "./types";
/** Оборачивает команду корреляцией, tracing и журналом завершения; сбой классификации не заменяет бизнес-результат. */
export const createCommandObserver =
  ({
    observability,
    uuid,
    clock = performance.now.bind(performance),
  }: ObserverDependencies): CommandObserver =>
  async ({ type, operationId, execute, classify }) => {
    const meta = { requestId: uuid(), ...(operationId ? { operationId } : {}) };
    const scope = observability?.tracing.startScope({
      name: commandObservation.spanName,
      headers: {},
    });
    /** Запускает наблюдаемую команду в отдельном контексте корреляции, сохраняя Promise вызывающему коду. */
    const run = () =>
      withContext({
        context: meta,
        /** Фиксирует завершение даже при исключении; ошибка telemetry-классификации оставляет исходный результат команды. */
        execute: async () => {
          const logCompletion = createCompletionLog({
            ...(observability ? { observability } : {}),
            clock,
            operation: type,
          });
          let completion: CommandCompletion = commandObservation.failure;
          try {
            const result = await execute(meta);
            try {
              completion = classify(result);
            } catch {
              // A telemetry classification failure must preserve the result.
            }
            return result;
          } finally {
            logCompletion(completion);
          }
        },
      });
    try {
      return await (scope ? scope.run(run) : run());
    } finally {
      scope?.end();
    }
  };
