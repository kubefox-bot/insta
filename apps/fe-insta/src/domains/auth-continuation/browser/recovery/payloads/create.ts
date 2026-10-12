import type {
  RecoveryDependencies,
  RecoverySource,
} from "../../../ports/recovery/types";
import type { StoryPreview } from "../../../ports/story-preview/interfaces";
import type { RecoveryPayloadState } from "../types";
/** Владеет временным текстом и opaque preview handle, без медиа-данных. */
export const createRecoveryPayloads = (
  pending: RecoveryDependencies["pending"],
) => {
  const payload: RecoveryPayloadState = {};
  /**
   * Удаляет suspended preview через его владельца и pending-текст по ключу, затем очищает
   * suspended-ссылку.
   */
  const release = () => {
    if (payload.suspended?.kind === "story")
      payload.storyPreview?.discard({ previewId: payload.suspended.previewId });
    if (payload.suspended) pending.cancel(payload.suspended.key);
    payload.suspended = undefined;
  };
  return {
    payload,
    release,
    /**
     * Очищает весь pending-store и текущий preview; завершение suspended-выбора выполняет
     * отдельный release.
     */
    discard: () => {
      pending.dispose();
      const preview = payload.storyPreview?.capture();
      if (preview) payload.storyPreview?.discard(preview);
    },
    /**
     * Отсоединяет источники текста и preview без самостоятельного уничтожения их владельцев.
     */
    disconnect: () => {
      payload.source = undefined;
      payload.storyPreview = undefined;
    },
    /**
     * Подключает источник текста для capture/restore; возвращённая очистка отсоединяет только
     * эту всё ещё текущую связь.
     */
    connect: (source: RecoverySource) => {
      payload.source = source;
      return () => {
        if (payload.source === source) payload.source = undefined;
      };
    },
    /**
     * Подключает владельца preview и возвращает снятие именно этой связи, не затрагивая более
     * позднее подключение.
     */
    connectStory: (source: StoryPreview) => {
      payload.storyPreview = source;
      return () => {
        if (payload.storyPreview === source) payload.storyPreview = undefined;
      };
    },
  };
};
