import type { RealtimeHost } from "./types";

/**
 * Подключает восстановление realtime к online, focus и visibilitychange браузера;
 * возвращённый teardown удаляет все три обработчика с переданных targets.
 */
export const mountRealtimeRecovery = ({
  window,
  visibility,
  resume,
}: Parameters<RealtimeHost["mount"]>[0] & Readonly<{ resume: () => void }>) => {
  /**
   * Возобновляет realtime при focus/visibilitychange только если документ видим.
   */
  const foreground = () => {
    if (visibility.visibilityState === "visible") resume();
  };
  window.addEventListener("online", resume);
  window.addEventListener("offline", resume);
  window.addEventListener("focus", foreground);
  visibility.addEventListener("visibilitychange", foreground);
  return () => {
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", resume);
    window.removeEventListener("focus", foreground);
    visibility.removeEventListener("visibilitychange", foreground);
  };
};
