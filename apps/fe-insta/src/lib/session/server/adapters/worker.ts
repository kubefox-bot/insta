import { revocationWorkerIntervalMs } from "../conts";
import type { RevocationDependencies } from "../ports/dependencies";
import { retryPendingRevocations } from "../use-cases/retry-revocation";
/** Запускает последовательные пачки отзыва с таймером между завершениями. Возвращённая stop-функция отменяет будущие пачки, очищает таймер и ждёт текущий pending; abort не прерывает уже выполняемый backend/store вызов. Переданные порты остаются во владении composition. */
export const startRevocationWorker = ({
  dependencies,
  onError,
}: Readonly<{ dependencies: RevocationDependencies; onError: () => void }>) => {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  const lifetime = new AbortController();
  /** Запоминает Promise текущей пачки и передаёт её ошибку onError. Следующий unref-таймер назначается только после settlement и только пока worker не остановлен. */
  const tick = () => {
    if (stopped) return;
    pending = retryPendingRevocations(dependencies, lifetime.signal)
      .catch(onError)
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, revocationWorkerIntervalMs);
          timer.unref();
        }
      });
  };
  tick();
  return async () => {
    stopped = true;
    lifetime.abort();
    clearTimeout(timer);
    await pending;
  };
};
