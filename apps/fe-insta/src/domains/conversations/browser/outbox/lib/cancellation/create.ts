/** Объединяет родительскую отмену и таймаут в сигнал и отклоняемый Promise; владелец обязан вызвать close. */
export const createCancellation = ({
  parent,
  timeoutMs,
}: Readonly<{ parent?: AbortSignal; timeoutMs: number }>) => {
  const controller = new AbortController();
  const stopped = Promise.withResolvers<never>();
  /** Отклоняет ожидающий Promise причиной отмены собственного контроллера. */
  const reject = () => stopped.reject(controller.signal.reason);
  /** Передаёт причину родительской отмены собственному контроллеру. */
  const forward = () => controller.abort(parent?.reason);
  controller.signal.addEventListener("abort", reject, { once: true });
  parent?.addEventListener("abort", forward, { once: true });
  if (parent?.aborted) forward();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("Outbox operation timed out", "TimeoutError"),
      ),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    stopped: stopped.promise,
    /** Снимает таймер и слушатели, отменяя собственный сигнал для завершения оставшейся работы. */
    close: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", forward);
      controller.abort();
      controller.signal.removeEventListener("abort", reject);
    },
  };
};
