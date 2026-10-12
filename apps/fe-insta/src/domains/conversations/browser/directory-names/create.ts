import { readonly, writable } from "svelte/store";
import type { AuthView } from "../../../users/browser/index";
import type { ConversationActor, ConversationRuntime } from "../types";

/** Создаёт приватный кеш имён найденных пользователей и readable снимки; результаты поиска привязываются к actor. */
export const createDirectoryNames = () => {
  const contents = new Map<string, string>();
  const state = writable<ReadonlyMap<string, string>>(new Map());
  let owner: ConversationActor | null = null;
  let disposed = false;
  /** Удаляет имена, сбрасывает владельца и публикует пустой снимок. */
  const clear = () => {
    owner = null;
    contents.clear();
    state.set(new Map());
  };
  return {
    view: readonly(state),
    clear,
    /** Сохраняет кеш только при неизменной авторизованной сессии; смена actor очищает имена. */
    reconcile: ({ actor, status }: Pick<AuthView, "actor" | "status">) => {
      if (disposed) return;
      const nextOwner = status === "authenticated" ? actor : null;
      if (!nextOwner) {
        clear();
        return;
      }
      if (
        owner?.userId === nextOwner.userId &&
        owner.generation === nextOwner.generation
      )
        return;
      clear();
      owner = { userId: nextOwner.userId, generation: nextOwner.generation };
    },
    /** Фиксирует actor для приёма результата поиска; возвращённый callback игнорирует поздние чужие данные и публикует копию кеша. */
    capture: (actor: ConversationActor) => {
      const { userId, generation } = actor;
      return (users: Awaited<ReturnType<ConversationRuntime["search"]>>) => {
        if (
          disposed ||
          !owner ||
          owner.userId !== userId ||
          owner.generation !== generation
        )
          return;
        for (const user of users) contents.set(user.id, user.username);
        state.set(new Map(contents));
      };
    },
    /** Отключает приём результатов и удаляет приватные имена. */
    dispose: () => {
      disposed = true;
      clear();
    },
  };
};
