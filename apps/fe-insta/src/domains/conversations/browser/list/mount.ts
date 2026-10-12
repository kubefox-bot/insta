import type { createListSynchronization } from "./create";
/** Подключает обновление списка к focus и visibilitychange; возвращённая очистка снимает оба слушателя и уничтожает синхронизатор. */
export const mountListSynchronization = ({
  synchronization: sync,
  onError,
}: Readonly<{
  synchronization: ReturnType<typeof createListSynchronization>;
  onError: () => void;
}>) => {
  /** Запускает обновление и направляет отклонение Promise в предоставленный обработчик ошибки. */
  const refresh = () => {
    sync.refresh().catch(onError);
  };
  /** При возвращении видимости обновляет список, при скрытии запрашивает отмену чтения. */
  const visibility = () => {
    if (document.visibilityState === "visible") refresh();
    else sync.suspend();
  };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", visibility);
    sync.dispose();
  };
};
