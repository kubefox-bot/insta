import { publicationFeedPolicy } from "../conts";

/** Хранит ограниченный TTL-набор только реально подтверждённых cache-эффектов. */
export const createConfirmedFeedRefreshes = (clock: () => number) => {
  const operations = new Map<string, number>();
  /** Освобождает истёкшие identity перед чтением и новой записью. */
  const prune = () => {
    const now = clock();
    for (const [key, expiresAt] of operations)
      if (expiresAt <= now) operations.delete(key);
  };
  return {
    /** Проверяет недавний завершённый SET, не продлевая его TTL чтением status. */
    has: (key: string) => {
      prune();
      return operations.has(key);
    },
    /** Запоминает успешный SET; при заполнении удаляет самую старую identity. */
    record: (key: string) => {
      prune();
      operations.delete(key);
      if (operations.size >= publicationFeedPolicy.maxRefreshedOperations) {
        const oldest = operations.keys().next();
        if (!oldest.done) operations.delete(oldest.value);
      }
      operations.set(key, clock() + publicationFeedPolicy.refreshedTtlMs);
    },
  };
};
