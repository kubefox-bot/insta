import type { AuthView } from "../../../users/browser/index";
import type { ConversationActor } from "../types";
import type { ScrollBinding, ScrollSnapshot } from "./types";

/** Копирует снимок вместе с вложенным якорем, чтобы UI не изменял сохранённую позицию по общей ссылке. */
const copySnapshot = (snapshot: ScrollSnapshot): ScrollSnapshot => ({
  ...snapshot,
  anchor: snapshot.anchor ? { ...snapshot.anchor } : null,
});

/** Владеет позициями прокрутки в памяти для одного actor; привязки теряют доступ после смены владельца или dispose. */
export const createConversationScroll = () => {
  const snapshots = new Map<string, ScrollSnapshot>();
  let owner: ConversationActor | null = null;
  let disposed = false;
  /** Удаляет все позиции и снимает владельца приватного кеша. */
  const clear = () => {
    snapshots.clear();
    owner = null;
  };
  return {
    clear,
    /** Сохраняет позиции лишь для неизменного авторизованного actor, иначе очищает их. */
    reconcile: ({ actor, status }: Pick<AuthView, "actor" | "status">) => {
      if (disposed) return;
      if (status !== "authenticated" || !actor) {
        clear();
        return;
      }
      if (
        owner?.userId === actor.userId &&
        owner.generation === actor.generation
      )
        return;
      clear();
      owner = { userId: actor.userId, generation: actor.generation };
    },
    /** Создаёт доступ к позиции одного диалога, фиксируя userId и generation. */
    bind: ({
      actor,
      conversationId,
    }: Readonly<{
      actor: ConversationActor;
      conversationId: string;
    }>): ScrollBinding => {
      const { userId, generation } = actor;
      /** Проверяет, что привязка ещё принадлежит активному владельцу и не уничтожена. */
      const current = () =>
        !disposed &&
        owner?.userId === userId &&
        owner.generation === generation;
      return {
        /** Возвращает независимую копию позиции только для действующей привязки. */
        read: () => {
          const snapshot = current()
            ? snapshots.get(conversationId)
            : undefined;
          return snapshot ? copySnapshot(snapshot) : null;
        },
        /** Сохраняет копию позиции, игнорируя события от устаревшего UI. */
        capture: (snapshot) => {
          if (!current()) return;
          snapshots.set(conversationId, copySnapshot(snapshot));
        },
      };
    },
    /** Окончательно отключает привязки и очищает приватные позиции. */
    dispose: () => {
      disposed = true;
      clear();
    },
  };
};
