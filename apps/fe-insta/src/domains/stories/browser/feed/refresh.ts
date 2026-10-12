import type { FeedRefresh } from "../types";
/** Объединяет запросы обновления в последовательный проход с одним отложенным повтором; dispose запрещает продолжение, но не отменяет уже вызванный refresh. */
export const createFeedRefresh = ({
  refresh,
}: Readonly<{ refresh: () => Promise<void> }>): FeedRefresh => {
  const owner: {
    disposed: boolean;
    requested: boolean;
    pending: Promise<void> | null;
  } = { disposed: false, requested: false, pending: null };
  /** Выполняет запрошенные обновления последовательно и очищает pending даже при ошибке refresh. */
  const drain = async () => {
    try {
      while (!owner.disposed && owner.requested) {
        owner.requested = false;
        await refresh();
      }
    } finally {
      owner.pending = null;
    }
  };
  return {
    /** Запрашивает обновление, разделяя текущий Promise между конкурентными вызывающими; после dispose возвращает завершённый Promise. */
    request: (): Promise<void> => {
      if (owner.disposed) return Promise.resolve();
      owner.requested = true;
      if (owner.pending) return owner.pending;
      owner.pending = Promise.resolve().then(drain);
      return owner.pending;
    },
    /** Запрещает дальнейшие проходы и сбрасывает запрос повтора, оставляя текущий refresh завершаться. */
    dispose: () => {
      owner.disposed = true;
      owner.requested = false;
    },
  };
};
