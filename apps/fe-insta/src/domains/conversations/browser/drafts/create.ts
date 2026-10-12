import { readonly, writable } from "svelte/store";
import type { ConversationActor, ConversationView } from "../types";
import { captureDraft } from "./capture";
import type { DraftIdentity } from "./types";
/** Хранит черновики по диалогам внутри владельца; при временной недоступности авторизации скрывает view, сохраняя тексты для сверки actor. */
export const createConversationDrafts = () => {
  const contents = new Map<string, string>();
  const state = writable<ReadonlyMap<string, string>>(new Map());
  let owner: ConversationActor | null = null;
  let active = false;
  /** Сравнивает владельца черновиков по userId и generation. */
  const matches = (actor: ConversationActor) =>
    owner?.userId === actor.userId && owner.generation === actor.generation;
  return {
    view: readonly(state),
    /** Получает непустой черновик выбранного диалога только при активном владельце. */
    capture: (snapshot: ConversationView) =>
      captureDraft({ snapshot, contents, owner: active ? owner : null }),
    /** Скрывает тексты при unavailable, удаляет их при потере или смене actor и публикует доступный снимок. */
    reconcile: ({ actor, status }: DraftIdentity) => {
      active = status === "authenticated" && actor !== null;
      if (status === "unavailable") {
        state.set(new Map());
        return;
      }
      if (!actor || !matches(actor)) contents.clear();
      owner = active ? actor : null;
      state.set(active ? new Map(contents) : new Map());
    },
    /** Изменяет черновик только активного владельца; пустой текст удаляет запись и обновляет readable снимок. */
    edit: ({
      actor,
      conversationId,
      text,
    }: Readonly<{
      actor: ConversationActor;
      conversationId: string;
      text: string;
    }>) => {
      if (!active || !matches(actor)) return;
      if (text) contents.set(conversationId, text);
      else contents.delete(conversationId);
      state.set(new Map(contents));
    },
    /** Деактивирует владельца и удаляет все приватные тексты из памяти и view. */
    dispose: () => {
      active = false;
      owner = null;
      contents.clear();
      state.set(new Map());
    },
  };
};
