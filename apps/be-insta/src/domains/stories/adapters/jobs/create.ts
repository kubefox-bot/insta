import { maintenancePolicy } from "../../domain/maintenance/conts";
import { createJobTimers } from "./timers";
import type { StoryJobsInput } from "./types";
/**
 * Владеет расписаниями, общим abort и задачами maintenance; здоровье хранит по операциям,
 * внешние клиенты не освобождает.
 */
export const createStoryJobs = (input: StoryJobsInput) => {
  const stopping = new AbortController();
  const running = new Set<Promise<void>>();
  const failures = new Set<string>();
  const schedules: (() => void)[] = [];
  const timers = input.timers ?? createJobTimers();
  let started = false;
  /**
   * Регистрирует периодический запуск и немедленно запускает первый проход, не допуская
   * перекрытия одной операции.
   */
  const schedule = (
    name: string,
    operation: (signal: AbortSignal) => Promise<unknown>,
    ms: number,
  ) => {
    let active = false;
    /**
     * Запускает проход только при свободном слоте и отсутствии остановки; учитывает
     * ошибку в здоровье и снимает задачу после settlement.
     */
    const run = () => {
      if (active || stopping.signal.aborted) return;
      active = true;
      const pending = Promise.resolve()
        .then(() => operation(stopping.signal))
        .then(
          () => {
            failures.delete(name);
          },
          () => {
            failures.add(name);
          },
        )
        .finally(() => {
          active = false;
          running.delete(pending);
        });
      running.add(pending);
    };
    schedules.push(timers.every(run, ms));
    run();
  };
  return {
    /**
     * Однократно включает cleanup, reconciliation и инвалидацию с их интервалами; после
     * остановки расписания не возобновляет.
     */
    start: () => {
      if (started || stopping.signal.aborted) return;
      started = true;
      schedule("cleanup", input.cleanup, maintenancePolicy.cleanupMs);
      schedule("reconcile", input.reconcile, maintenancePolicy.reconcileMs);
      schedule("invalidate", input.invalidate, maintenancePolicy.cleanupMs);
    },
    /** Возвращает degraded, пока есть ошибка maintenance или сработал shutdown watchdog. */
    status: () => (failures.size ? ("degraded" as const) : ("ok" as const)),
    /**
     * Останавливает расписания и запрашивает отмену, затем ждёт реальное settlement
     * задач. Watchdog лишь отмечает отказ, не освобождает зависимости раньше времени.
     */
    close: async () => {
      stopping.abort();
      for (const cancel of schedules) cancel();
      const cancelWatchdog = timers.after(() => {
        failures.add("shutdown");
      }, maintenancePolicy.shutdownMs);
      try {
        await Promise.allSettled([...running]);
      } finally {
        cancelWatchdog();
      }
    },
  };
};
