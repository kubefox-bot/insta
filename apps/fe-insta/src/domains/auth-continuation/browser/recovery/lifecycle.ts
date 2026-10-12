import type { RecoveryDependencies } from "../../ports/recovery/types";
import { createRecoveryPayloads } from "./payloads/create";
import { createSelectionLifetime } from "./selection/lifetime";
/**
 * Соединяет expiry/epoch выбранного intent с владельцем временных данных; обеспечивает общий
 * discard и окончательный dispose без хранения медиа.
 */
export const createRecoveryLifecycle = (
  pending: RecoveryDependencies["pending"],
) => {
  const payloads = createRecoveryPayloads(pending);
  const lifetime = createSelectionLifetime({
    now: Date.now,
    /**
     * Создаёт таймер истечения выбора и возвращает явное освобождение этого таймера.
     */
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs);
      return () => clearTimeout(timer);
    },
    release: payloads.release,
  });
  /**
   * Завершает lifetime выбранного intent, затем удаляет весь pending-текст и текущий preview.
   */
  const discardAll = () => {
    lifetime.retire();
    payloads.discard();
  };
  return {
    ...lifetime,
    payload: payloads.payload,
    discardAll,
    connect: payloads.connect,
    connectStory: payloads.connectStory,
    /**
     * Освобождает выбор и payload, помечает lifetime закрытым и отсоединяет источники
     * восстановления.
     */
    dispose: () => {
      discardAll();
      lifetime.dispose();
      payloads.disconnect();
    },
  };
};
