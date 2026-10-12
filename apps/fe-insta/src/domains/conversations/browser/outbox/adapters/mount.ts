import type { OutboxBrowser } from "../lib/types";
/** Будит очередь сразу, при фокусе и восстановлении сети; возвращённая очистка снимает слушатели и вызывает dispose. */
export const mountOutbox = ({
  outbox,
  onError,
}: Readonly<{ outbox: OutboxBrowser; onError: (error: unknown) => void }>) => {
  /** Передаёт отклонение фонового пробуждения заданному обработчику ошибок. */
  const wake = () => {
    outbox.wake().catch(onError);
  };
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  wake();
  return () => {
    window.removeEventListener("focus", wake);
    window.removeEventListener("online", wake);
    outbox.dispose();
  };
};
