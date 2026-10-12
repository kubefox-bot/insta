import {
  type ConversationStore,
  conversationIssues,
  createIndexedDbQueue,
  createOutbox,
  createOutboxAuth,
  createOutboxBroadcast,
  createOutboxLocks,
  createOutboxSender,
  mountOutbox,
} from "../../../domains/conversations/browser/index";
import type { AuthBrowser } from "../../../domains/users/browser/index";
/**
 * Собирает браузерный outbox из IndexedDB, Web Locks, broadcast, auth и отправителя; mount
 * подключает пробуждения, возвращённый dispose освобождает его lifecycle.
 */
export const createConversationQueue = ({
  auth,
  store,
}: Readonly<{ auth: AuthBrowser; store: ConversationStore }>) => {
  const outbox = createOutbox({
    queue: createIndexedDbQueue({ factory: indexedDB }),
    auth: createOutboxAuth(auth),
    locks: createOutboxLocks(navigator.locks),
    changes: createOutboxBroadcast(),
    sender: createOutboxSender({
      /**
       * Проецирует подтверждённое сообщение в store с identity владельца очереди, чтобы store мог
       * отклонить чужое поколение.
       */
      onConfirmed: (message, owner) =>
        store.receive(message, {
          userId: owner.ownerId,
          generation: owner.generation,
        }),
      /**
       * Показывает ошибку проекции подтверждённого сообщения, не выдавая её за неуспешную отправку.
       */
      onConsumerError: () =>
        store.report(conversationIssues.messageProjectionFailed),
    }),
  });
  const dispose = mountOutbox({
    outbox,
    /**
     * Отмечает недоступность outbox при ошибке смонтированного фонового прохода.
     */
    onError: () => store.report(conversationIssues.outboxUnavailable),
  });
  return { outbox, dispose };
};
