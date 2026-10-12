import { logFields } from "@insta/fe-core/observability/contracts";
import { commandObservation } from "./conts";
import type { CommandCompletion, ObserverDependencies } from "./types";
/** Создаёт измеритель времени команды; ошибки журналирования не влияют на её результат. */
export const createCompletionLog = ({
  observability,
  clock,
  operation,
}: Pick<ObserverDependencies, "observability"> &
  Readonly<{
    clock: () => number;
    operation: string;
  }>) => {
  const startedAt = clock();
  return (completion: CommandCompletion) => {
    try {
      const elapsed = clock() - startedAt;
      observability?.adapter.logger[
        commandObservation.levels[completion.outcome]
      ]({
        [logFields.eventType]: commandObservation.eventType,
        business: {
          operation,
          code: completion.code,
          outcome: completion.outcome,
          authority: commandObservation.authority,
          [logFields.durationMs]: Number.isFinite(elapsed)
            ? Math.max(0, elapsed)
            : 0,
        },
      });
    } catch {
      // Logging is fail-open and cannot replace an execution result/error.
    }
  };
};
