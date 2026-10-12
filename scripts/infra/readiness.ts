import { readinessDeadlineMs, readinessPollMs } from "./conts";
/** Опрашивает асинхронный readiness check до deadline, учитывая отмену между попытками. Ошибки check сохраняются; сам check не прерывается таймером этой функции. */
export const waitUntil = async ({
  check,
  timeoutMs = readinessDeadlineMs,
  signal,
}: {
  readonly check: () => Promise<boolean>;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (await check()) return;
    await Bun.sleep(readinessPollMs);
  }
  throw new Error("Readiness barrier deadline exceeded");
};
