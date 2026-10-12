import { Result } from "@bloodyowl/boxed";
import { analyticsPolicy } from "./conts";
import { dispatchAnalyticsWave } from "./dispatch-wave";
import type { AnalyticsWorkerOptions } from "./types";
/** Запускает последовательный опрос analytics outbox; возвращаемый close отменяет lifetime и ждёт текущую волну. */
export const startCanonicalAnalytics = (options: AnalyticsWorkerOptions) => {
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  const lifetime = new AbortController();
  /** Запускает одну волну доставки и планирует следующую только после settlement, пока не запрошена остановка. */
  const poll = () => {
    if (stopping) return;
    pending = dispatchAnalyticsWave({
      options,
      /** Позволяет текущей волне увидеть запрос остановки до получения следующего claim. */
      stopping: () => stopping,
      signal: lifetime.signal,
    })
      .catch(() => {
        Result.fromExecution(options.onError);
      })
      .finally(() => {
        if (!stopping) timer = setTimeout(poll, analyticsPolicy.pollMs);
      });
  };
  poll();
  return {
    /** Останавливает новые analytics claims, отменяет lifetime и ждёт текущую волну перед освобождением зависимостей. */
    close: async () => {
      stopping = true;
      lifetime.abort();
      clearTimeout(timer);
      await pending;
    },
  };
};
