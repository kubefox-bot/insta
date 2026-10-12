import { setTimeout as delay } from "node:timers/promises";
import { supportPolicy } from "../domain/conts";
import type { MailWorkerDependencies } from "../ports/types";
import { cleanupReports } from "../use-cases/cleanup";
import { dispatchSupportMail } from "../use-cases/dispatch";
import { deliveryHealth } from "./worker-health";

/**
 * Запускает цикл доставки и очистки с раздельным состоянием здоровья. Владеет
 * abort-контроллером и фоновой задачей, но не клиентами зависимостей.
 */
export const startSupportWorker = (dependencies: MailWorkerDependencies) => {
  const controller = new AbortController();
  let delivery: "ok" | "degraded" = "ok";
  let cleanup: "ok" | "degraded" = "ok";
  let nextCleanup = 0;
  /**
   * При наступлении срока выполняет очистку и затем доставку; ошибки отражает в здоровье
   * соответствующей операции для следующего опроса.
   */
  const cycle = async () => {
    if (dependencies.clock() >= nextCleanup) {
      await cleanupReports(dependencies).then(
        () => {
          cleanup = "ok";
          nextCleanup = dependencies.clock() + supportPolicy.cleanupMs;
        },
        () => {
          cleanup = "degraded";
        },
      );
    }
    await dispatchSupportMail(dependencies, controller.signal).then(
      (summary) => {
        delivery = deliveryHealth({ previous: delivery, summary });
      },
      () => {
        delivery = "degraded";
      },
    );
  };
  /**
   * Повторяет рабочие проходы с отменяемой задержкой; остановка ждёт завершения текущего
   * прохода.
   */
  const run = async () => {
    while (!controller.signal.aborted) {
      await cycle();
      await delay(supportPolicy.pollMs, undefined, {
        signal: controller.signal,
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) throw error;
      });
    }
  };
  const running = run();
  return {
    /**
     * Показывает degraded при отказе доставки или очистки, не сбрасывая прежний отказ
     * доставки из-за пустой очереди.
     */
    status: () =>
      delivery === "ok" && cleanup === "ok"
        ? ("ok" as const)
        : ("degraded" as const),
    /**
     * Отменяет ожидание и новые проходы, затем ждёт settlement фоновой задачи перед
     * освобождением клиентов внешним владельцем.
     */
    close: async () => {
      controller.abort();
      await running;
    },
  };
};
