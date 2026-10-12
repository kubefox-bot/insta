import { conversationIssues } from "../conts";
import { createHistoryOperations } from "./lib/history-operations";
import { ConversationState } from "./lib/state";
import type {
  Conversation,
  ConversationActor,
  ConversationStore,
} from "./types";
/** Создаёт отдельное состояние диалогов и операции истории; наружу отдаёт readable view и привязанные методы, сохраняя мутации внутри владельца. */
export const createConversationStore = (
  input: Readonly<{
    initial: readonly Conversation[];
    actor: ConversationActor | null;
  }>,
): ConversationStore => {
  const state = new ConversationState(input);
  const operations = createHistoryOperations(state);
  return {
    view: state.view,
    hydrate: state.hydrate,
    select: state.select,
    reconcileActor: state.reconcileActor,
    receive: state.receive,
    receiveReceipts: state.receiveReceipts,
    setConnection: state.setConnection,
    report: state.report,
    setSubscriptionIssue: state.setSubscriptionIssue,
    addConversation: state.addConversation,
    applyList: state.applyList,
    /** Обновляет список только для текущего actor и живого запроса; поздние результаты игнорирует, актуальный сбой отражает в issue. */
    synchronizeList: async ({ actor, signal }, load) => {
      if (!state.owned(actor) || signal.aborted) return;
      const owned = state.beginList(actor);
      /** Проверяет, что запрос списка не вытеснен новым запросом, сменой actor или отменой. */
      const active = () => owned() && !signal.aborted;
      try {
        const conversations = await load();
        if (active()) state.applyList({ actor, conversations });
      } catch {
        if (active()) state.report(conversationIssues.conversationsUnavailable);
      }
    },
    clear: state.clear,
    ...operations,
  };
};
