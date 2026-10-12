import { get } from "svelte/store";
import type {
  ConversationStore,
  createConversationSession,
} from "../../../domains/conversations/browser/index";
import {
  conversationConnectionStates,
  conversationIssues,
} from "../../../domains/conversations/browser/index";
import { connectionStates } from "../../../lib/realtime/index";
import type { createConversationRealtime } from "./realtime";
/**
 * Подписывает store на статус realtime; после соединения обновляет список и выбранную историю
 * с раздельными ошибками. Возвращает отписку, сам connection остаётся у runtime.
 */
export const attachConversationConnection = ({
  store,
  session,
  connection,
  connectionStatus,
  connected,
}: Readonly<{
  store: ConversationStore;
  session: ReturnType<typeof createConversationSession>;
  connection: ReturnType<typeof createConversationRealtime>["connection"];
  connectionStatus: ReturnType<
    typeof createConversationRealtime
  >["connectionStatus"];
  connected: () => Promise<void>;
}>) =>
  connection.viewState.subscribe(({ kind, issue }) => {
    store.setConnection(
      navigator.onLine
        ? connectionStatus[kind]
        : conversationConnectionStates.offline,
      issue,
    );
    if (kind !== connectionStates.connected) return;
    connected().catch(() =>
      store.report(conversationIssues.conversationsUnavailable),
    );
    const id = get(store.view).selectedId;
    if (id)
      session
        .synchronize(id)
        .catch(() => store.report(conversationIssues.historyUnavailable));
  });
