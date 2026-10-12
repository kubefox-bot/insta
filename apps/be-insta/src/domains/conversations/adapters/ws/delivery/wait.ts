/** Один отменяемый subscription timer; cleanup выполняется до завершения promise. */
export const waitDelivery = ({
  delayMs,
  signal,
}: Readonly<{ delayMs: number; signal: AbortSignal }>) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    /** Снимает listener и timer при любом terminal исходе ожидания. */
    const finish = (aborted: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (aborted) reject(signal.reason);
      else resolve();
    };
    /** Отмена lifetime запрещает новый attempt сразу. */
    const abort = () => finish(true);
    const timer = setTimeout(() => finish(false), delayMs);
    signal.addEventListener("abort", abort, { once: true });
  });
