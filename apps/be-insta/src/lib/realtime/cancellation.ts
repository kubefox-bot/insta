import { realtimePolicy } from "./conts";
/** Объединяет внешнюю отмену с дедлайном авторизации; ждёт execute и освобождает свой таймер при любом исходе. */
export const withPublicationSignal = async <T>({
  signal,
  execute,
}: Readonly<{
  signal?: AbortSignal;
  execute: (signal: AbortSignal) => Promise<T>;
}>): Promise<T> => {
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new Error("Realtime authorization deadline")),
    realtimePolicy.authorizationTimeoutMs,
  );
  const owned = signal
    ? AbortSignal.any([signal, deadline.signal])
    : deadline.signal;
  try {
    owned.throwIfAborted();
    return await execute(owned);
  } finally {
    clearTimeout(timer);
  }
};
