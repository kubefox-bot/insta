import type { PublicationFeedRefresh } from "../../../ports/feed/types";
import { publicationFeedPolicy } from "../conts";
import type { createConfirmedFeedRefreshes } from "./confirmed";

/** Владеет ограниченной последовательностью SET; разные commit требуют нового прохода. */
export const createFeedRefreshQueue = ({
  invalidate,
  confirmed,
}: Readonly<{
  invalidate: () => Promise<void>;
  confirmed: ReturnType<typeof createConfirmedFeedRefreshes>;
}>) => {
  const pending = new Map<string, Promise<PublicationFeedRefresh>>();
  let last: Promise<PublicationFeedRefresh> = Promise.resolve("refreshed");
  let stopping = false;
  return {
    /** Повторы делят свой SET; новый commit ставится после уже начатого эффекта. */
    enqueue: (key: string): Promise<PublicationFeedRefresh> | null => {
      if (stopping) return null;
      if (confirmed.has(key)) return Promise.resolve("refreshed");
      const existing = pending.get(key);
      if (existing) return existing;
      if (pending.size >= publicationFeedPolicy.maxPendingOperations)
        return null;
      const operation = last
        .then(async (): Promise<PublicationFeedRefresh> => {
          if (stopping) return "deferred";
          const result = await Promise.resolve()
            .then(invalidate)
            .then(
              (): PublicationFeedRefresh => "refreshed",
              (): PublicationFeedRefresh => "deferred",
            );
          if (result === "refreshed") confirmed.record(key);
          return result;
        })
        .finally(() => pending.delete(key));
      pending.set(key, operation);
      last = operation;
      return operation;
    },
    /** Закрывает admission и ждёт все owned эффекты; queued SET после остановки пропускает. */
    close: async () => {
      stopping = true;
      await last;
    },
  };
};
