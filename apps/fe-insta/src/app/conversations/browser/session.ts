import { get } from "svelte/store";
import {
  type ConversationStore,
  createConversationSession,
  createConversationTransport,
} from "../../../domains/conversations/browser/index";
import type { Actor, AuthBrowser } from "../../../domains/users/browser/index";
import type { RealtimeHost } from "../../realtime/browser/index";
import { createConversationRealtime } from "./realtime";
/**
 * Связывает conversation session с REST transport, realtime и навигацией для одного actor;
 * возвращает connection владельцу runtime для последующего освобождения.
 */
export const createRuntimeSession = ({
  actor,
  store,
  auth,
  navigate,
  observe,
  onMessage,
  realtimeHost,
}: Readonly<{
  actor: Actor;
  store: ConversationStore;
  auth: AuthBrowser;
  navigate: (url: string) => Promise<void>;
  observe?: (kind: string) => void;
  onMessage?: () => void;
  realtimeHost?: RealtimeHost;
}>) => {
  const transport = createConversationTransport({ actor });
  const realtime = createConversationRealtime({
    actor,
    store,
    auth,
    observe,
    onMessage,
    realtimeHost,
    recover: (id) => session.synchronize(id),
  });
  const session = createConversationSession({
    actor,
    store,
    /**
     * Получает актуального actor для отсечения ответов от предыдущей сессии диалога.
     */
    currentActor: () => get(auth.view).actor,
    history: transport.history,
    start: transport.start,
    subscribe: realtime.subscribe,
    /**
     * Передаёт переход к выбранному диалогу внедрённой навигации и сохраняет её Promise.
     */
    openConversation: ({ conversationId }) =>
      navigate(`/conversations/${conversationId}`),
  });
  return {
    transport,
    session,
    connection: realtime.connection,
    connectionStatus: realtime.connectionStatus,
    retry: realtime.retry,
  };
};
