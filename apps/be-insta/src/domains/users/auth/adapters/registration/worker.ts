import { setTimeout as delay } from "node:timers/promises";
import type { RegistrationCrypto } from "../../ports/registration/crypto";
import type {
  EmailJobs,
  EmailSender,
} from "../../ports/registration/email-jobs";
import type { RegistrationPersistence } from "../../ports/registration/persistence";
import { cleanupRegistration } from "../../use-cases/cleanup-registration";
import { deliverCode } from "../../use-cases/deliver-code";
import { deliveryHealth } from "./conts";
import { registrationQueue } from "./dragonfly/conts";

type Dependencies = Readonly<{
  jobs: EmailJobs;
  crypto: RegistrationCrypto;
  sender: EmailSender;
  registration: RegistrationPersistence;
  clock: () => number;
}>;
/**
 * Ждёт интервал очереди с отменой; поглощает прерывание при shutdown, остальные ошибки
 * таймера пробрасывает.
 */
const poll = async (signal: AbortSignal) => {
  try {
    await delay(registrationQueue.pollMs, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
};
/**
 * Выполняет одну попытку доставки и переводит неожиданную ошибку в failed для health
 * worker, не подтверждая job самостоятельно.
 */
const consume = async (dependencies: Dependencies) => {
  try {
    return await deliverCode(dependencies);
  } catch {
    return "failed" as const;
  }
};
/**
 * Запускает очистку истёкших регистраций и возвращает её health; отказ не прерывает
 * дальнейший цикл доставки.
 */
const sweep = async (dependencies: Dependencies) => {
  try {
    await cleanupRegistration({
      persistence: dependencies.registration,
      clock: dependencies.clock,
    });
    return true;
  } catch {
    return false;
  }
};
/** Считает worker degraded при сбое cleanup независимо от последнего результата доставки. */
const combinedHealth = ({
  delivery,
  cleanupHealthy,
}: Readonly<{
  delivery: "ok" | "degraded";
  cleanupHealthy: boolean;
}>) => (cleanupHealthy ? delivery : "degraded");
/**
 * Последовательно доставляет письма и периодически очищает регистрации; после abort
 * прекращает новые итерации, дожидаясь уже начатых операций.
 */
const runWorker = async ({
  dependencies,
  signal,
  report,
}: Readonly<{
  dependencies: Dependencies;
  signal: AbortSignal;
  report: (status: "ok" | "degraded") => void;
}>) => {
  let delivery: "ok" | "degraded" = "ok";
  let cleanupHealthy = true;
  let nextCleanupAt = dependencies.clock();
  while (!signal.aborted) {
    const outcome = await consume(dependencies);
    delivery = deliveryHealth[outcome] ?? delivery;
    report(combinedHealth({ delivery, cleanupHealthy }));
    if (signal.aborted) break;
    if (dependencies.clock() >= nextCleanupAt) {
      cleanupHealthy = await sweep(dependencies);
      report(combinedHealth({ delivery, cleanupHealthy }));
      nextCleanupAt =
        dependencies.clock() + registrationQueue.cleanupIntervalMs;
    }
    await poll(signal);
  }
};
/**
 * Запускает принадлежащий ему цикл и AbortController; close ждёт settlement, но не
 * закрывает заимствованные SMTP/Redis/Mongo зависимости.
 */
export const startRegistrationWorker = (dependencies: Dependencies) => {
  let status: "ok" | "degraded" = "ok";
  const controller = new AbortController();
  const running = runWorker({
    dependencies,
    signal: controller.signal,
    /**
     * Сохраняет последнюю объединённую оценку здоровья доставки и cleanup для внешнего
     * status.
     */
    report: (value) => {
      status = value;
    },
  });
  return {
    /**
     * Возвращает последний health-снимок worker без дополнительного запроса к
     * зависимостям.
     */
    status: () => status,
    /**
     * Запрашивает остановку polling и ждёт завершения выполняемой доставки/очистки до
     * возврата вызывающему.
     */
    close: async () => {
      controller.abort();
      await running;
    },
  };
};
