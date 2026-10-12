import {
  type ConversationStore,
  conversationIssues,
  type UnreadSummary,
} from "../../../domains/conversations/browser/index";
/**
 * Создаёт уведомление об изменении unread: при наличии summary запускает его refresh, а
 * ошибку показывает в conversation store; summary остаётся заимствованным.
 */
export const createUnreadInvalidation =
  ({
    unread,
    store,
  }: Readonly<{
    unread?: UnreadSummary;
    store: ConversationStore;
  }>) =>
  () => {
    unread
      ?.invalidate()
      .catch(() => store.report(conversationIssues.conversationsUnavailable));
  };
