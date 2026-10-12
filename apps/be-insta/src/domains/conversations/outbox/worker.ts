/**
 * Владеет непересекающимся polling-циклом и сигналом остановки; следующий poll
 * назначается только после settlement dispatch, ошибки передаются onError.
 */
export const startOutboxWorker = ({
  dispatch,
  intervalMs,
  onError,
}: Readonly<{
  dispatch: (signal: AbortSignal) => Promise<void>;
  intervalMs: number;
  onError: () => void;
}>) => {
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  const lifetime = new AbortController();
  /**
   * Запускает один dispatch, обрабатывает отказ через onError и планирует следующий
   * таймер только если worker ещё работает.
   */
  const poll = () => {
    if (stopping) return;
    pending = dispatch(lifetime.signal)
      .catch(onError)
      .finally(() => {
        if (!stopping) timer = setTimeout(poll, intervalMs);
      });
  };
  poll();
  return {
    /**
     * Запрещает новые poll, отменяет lifetime, снимает таймер и ждёт текущий dispatch до
     * освобождения зависимостей владельцем.
     */
    close: async () => {
      stopping = true;
      lifetime.abort();
      clearTimeout(timer);
      await pending;
    },
  };
};
