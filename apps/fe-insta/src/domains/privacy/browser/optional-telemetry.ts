import { Result } from "@bloodyowl/boxed";
import type { PublicPreference } from "@insta/contracts/privacy";
import { canStartOptional } from "../domain/decision";
import type { OptionalAdapter } from "../ports/optional-telemetry";
import type { OptionalState } from "./types";

/**
 * Пытается остановить и очистить адаптер даже при ошибке первого шага; объединяет ошибки
 * освобождения.
 */
const release = async (adapter: OptionalAdapter) => {
  const stopped = await Result.fromPromise(
    Promise.resolve().then(adapter.stop),
  );
  const cleared = await Result.fromPromise(
    Promise.resolve().then(adapter.clear),
  );
  const failures = [stopped, cleared].flatMap((result) =>
    result.isError() ? [result.getError()] : [],
  );
  if (failures.length)
    throw new AggregateError(failures, "Optional adapter cleanup failed");
};
/**
 * Последовательно загружает и запускает адаптеры, регистрируя владение до запуска; устаревшее
 * поколение освобождает полученный адаптер.
 */
const loadAdapters = async ({
  adapters,
  state,
  epoch,
  releaseOwned,
}: Readonly<{
  adapters: readonly (() => Promise<OptionalAdapter>)[];
  state: OptionalState;
  epoch: number;
  releaseOwned: (adapter: OptionalAdapter) => Promise<void>;
}>) => {
  for (const load of adapters) {
    const adapter = await load();
    state.active.add(adapter);
    if (state.epoch !== epoch) {
      await releaseOwned(adapter);
      return;
    }
    await adapter.start();
    if (state.epoch !== epoch) {
      await releaseOwned(adapter);
      return;
    }
  }
};
/**
 * После сбоя запуска текущего поколения останавливает приобретённые адаптеры; сохраняет
 * исходную ошибку и возможную ошибку очистки.
 */
const finishStart = async ({
  started,
  state,
  epoch,
  stop,
}: Readonly<{
  started: Result<void, unknown>;
  state: OptionalState;
  epoch: number;
  stop: () => Promise<void>;
}>) => {
  if (started.isOk()) return;
  if (state.epoch !== epoch) throw started.getError();
  const cleanup = await Result.fromPromise(stop());
  if (cleanup.isError())
    throw new AggregateError(
      [started.getError(), cleanup.getError()],
      "Optional start and cleanup failed",
      { cause: started.getError() },
    );
  throw started.getError();
};

/**
 * Владеет лениво загружаемыми адаптерами телеметрии и поколением согласия; неуспешное
 * освобождение остаётся доступным для повторной попытки.
 */
export const createOptionalTelemetry = ({
  adapters,
}: Readonly<{ adapters: readonly (() => Promise<OptionalAdapter>)[] }>) => {
  const state: OptionalState = {
    epoch: 0,
    active: new Set(),
    cleaning: new Map(),
  };
  /**
   * Объединяет параллельную очистку одного адаптера; удаляет владение только после успешных
   * stop и clear, учитывая поздний запуск.
   */
  const releaseOwned = (adapter: OptionalAdapter): Promise<void> => {
    const pending = state.cleaning.get(adapter);
    if (pending) return pending;
    // A late start may acquire resources after a previous stop completed.
    state.active.add(adapter);
    const cleanup = release(adapter)
      .then(() => {
        state.active.delete(adapter);
      })
      .finally(() => {
        state.cleaning.delete(adapter);
      });
    state.cleaning.set(adapter, cleanup);
    return cleanup;
  };
  /**
   * Инвалидирует запуск и ревизию согласия, ожидает попытки освобождения известных активных
   * адаптеров; позднее приобретение обрабатывает проверка поколения.
   */
  const stop = async () => {
    state.epoch += 1;
    state.revision = undefined;
    await Promise.all([...state.active].map(releaseOwned));
  };
  /**
   * Запускает адаптеры только при действующем согласии, после остановки прежнего набора;
   * повтор той же ревизии не создаёт второй запуск.
   */
  const start = async (preference: PublicPreference) => {
    if (!canStartOptional(preference)) {
      await stop();
      return;
    }
    if (state.revision === preference.revision) return;
    const stopping = stop();
    const epoch = state.epoch;
    await stopping;
    if (state.epoch !== epoch) return;
    state.revision = preference.revision;
    const started = await Result.fromPromise(
      loadAdapters({ adapters, state, epoch, releaseOwned }),
    );
    await finishStart({ started, state, epoch, stop });
  };
  return { start, stop };
};
