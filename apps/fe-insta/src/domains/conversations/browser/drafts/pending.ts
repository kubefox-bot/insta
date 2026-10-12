import type { PendingDrafts } from "./types";

/** Хранит тексты ожидающих auth-intent только в памяти browser; выдача текста одноразовая и может быть ограничена пользователем. */
export const createPendingDrafts = (): PendingDrafts => {
  const snapshots = new Map<
    string,
    Readonly<{ text: string; expectedUserId?: string }>
  >();
  return {
    /** Сохраняет текст и ожидаемого пользователя для конкретного intent, заменяя предыдущий снимок. */
    remember: ({ intentId, text, expectedUserId }) => {
      snapshots.set(intentId, { text, expectedUserId });
    },
    /** Удаляет снимок до проверки пользователя и возвращает текст только подходящему actor; повторная выдача невозможна. */
    take: ({ intentId, actorId }) => {
      const snapshot = snapshots.get(intentId);
      snapshots.delete(intentId);
      if (snapshot?.expectedUserId && snapshot.expectedUserId !== actorId)
        return undefined;
      return snapshot?.text;
    },
    /** Удаляет приватный текст отменённого intent. */
    cancel: (intentId) => {
      snapshots.delete(intentId);
    },
    /** Удаляет все ожидающие тексты при завершении владельца. */
    dispose: () => {
      snapshots.clear();
    },
  };
};
