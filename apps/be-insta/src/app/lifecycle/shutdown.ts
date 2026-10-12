import { shutdownTimeoutMs } from "./conts";

/** Объединяет сигналы остановки в один Promise; watchdog сообщает отказ и форсирует соединения, таймер очищается после settlement close. */
export const createShutdown = ({
  close,
  forceClose,
  onFailure,
  timeoutMs = shutdownTimeoutMs,
}: Readonly<{
  close: () => Promise<void>;
  forceClose: () => void;
  onFailure: () => void;
  timeoutMs?: number;
}>) => {
  let closing: Promise<void> | undefined;
  return (_signal: string): Promise<void> => {
    closing ??= (async () => {
      let expired = false;
      const deadline = setTimeout(() => {
        expired = true;
        forceClose();
        onFailure();
      }, timeoutMs);
      try {
        await close();
        if (expired) throw new Error("Shutdown deadline exceeded");
      } finally {
        clearTimeout(deadline);
      }
    })();
    return closing;
  };
};
