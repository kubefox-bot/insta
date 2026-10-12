import type {
  StoryCleanup,
  StoryOutbox,
  StoryOwnership,
} from "../ports/maintenance/interfaces";
import type { StoryStorage } from "../ports/storage/interfaces";
import { cleanupExpired } from "./cleanup";
import { reconcileObjects } from "./reconcile";
/**
 * Собирает обслуживание объектов, cleanup и инвалидацию ленты на переданных портах;
 * клиентами продолжает владеть composition.
 */
export const createStoryMaintenance = (
  dependencies: Readonly<{
    cleanup: StoryCleanup;
    ownership: StoryOwnership;
    outbox: StoryOutbox;
    storage: StoryStorage;
    profiles: readonly Readonly<{ id: string; prefix: string }>[];
    clock: () => number;
    invalidate: () => Promise<void>;
    notify?: (
      input: Readonly<{ eventId: string; signal: AbortSignal }>,
    ) => Promise<void>;
  }>,
) => ({
  /**
   * Запускает удаление просроченных объектов и сообщает неполную очистку ошибкой, чтобы
   * scheduler сохранил degraded состояние.
   */
  cleanup: async (signal: AbortSignal) => {
    const result = await cleanupExpired(
      { now: dependencies.clock(), signal },
      dependencies,
    );
    if (result.failed > 0) throw new Error("Stories cleanup incomplete");
    return result;
  },
  /**
   * Обходит настроенные storage-профили до отмены, собирая ошибки профилей; успешный
   * обход одного профиля не скрывает отказ другого.
   */
  reconcile: async (signal: AbortSignal) => {
    const failures: unknown[] = [];
    for (const profile of dependencies.profiles) {
      if (signal.aborted) break;
      try {
        await reconcileObjects(
          { profile: profile.id, prefix: profile.prefix, signal },
          dependencies,
        );
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, "Stories reconciliation incomplete");
  },
  /**
   * Обрабатывает durable outbox последовательно: сначала инвалидирует ленту, затем
   * подтверждает событие. Abort оставляет необработанные записи для следующего прохода.
   */
  invalidate: async (signal: AbortSignal) => {
    if (signal.aborted) return;
    const events = await dependencies.outbox.pending();
    for (const id of events) {
      if (signal.aborted) break;
      await dependencies.invalidate();
      await dependencies.notify?.({ eventId: id, signal });
      await dependencies.outbox.acknowledge(id);
    }
  },
});
