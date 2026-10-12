import { get } from "svelte/store";
import {
  type ConversationActor,
  type ConversationStore,
  conversationIssues,
  type createConversationTransport,
  createListSynchronization,
  mountListSynchronization,
  type UnreadSummary,
} from "../../../domains/conversations/browser/index";
import type { AuthBrowser } from "../../../domains/users/browser/index";
/**
 * Подключает список к заимствованному unread summary либо создаёт собственную синхронизацию с
 * browser lifecycle; возвращает освобождение подписки и сохраняет initial hydration без
 * лишнего refresh.
 */
export const createConversationListRuntime = ({
  actor,
  store,
  auth,
  transport,
  initialHydration,
  unread,
}: Readonly<{
  actor: ConversationActor;
  store: ConversationStore;
  auth: AuthBrowser;
  transport: ReturnType<typeof createConversationTransport>;
  initialHydration: boolean;
  unread?: UnreadSummary;
}>) => {
  if (unread) {
    const dispose = unread.view.subscribe((snapshot) => {
      if (
        snapshot.actor?.userId === actor.userId &&
        snapshot.actor.generation === actor.generation &&
        snapshot.list
      )
        store.applyList({ actor, conversations: snapshot.list.items });
    });
    return { connected: unread.invalidate, dispose };
  }
  const synchronization = createListSynchronization({
    actor,
    store,
    /**
     * Читает actor на момент проверки результата загрузки списка, чтобы смена сессии
     * инвалидировала старую работу.
     */
    currentActor: () => get(auth.view).actor,
    /**
     * Сообщает синхронизации, находится ли документ на переднем плане.
     */
    visible: () => document.visibilityState === "visible",
    load: transport.list,
  });
  const dispose = mountListSynchronization({
    synchronization,
    /**
     * Переводит ошибку фонового обновления списка в видимое состояние conversationsUnavailable.
     */
    onError: () => store.report(conversationIssues.conversationsUnavailable),
  });
  if (!initialHydration)
    synchronization
      .refresh()
      .catch(() => store.report(conversationIssues.conversationsUnavailable));
  return { connected: synchronization.connected, dispose };
};
