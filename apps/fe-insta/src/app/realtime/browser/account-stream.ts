import type { Writable } from "svelte/store";
import { createUnreadSubscription } from "../../../domains/conversations/browser/realtime/index";
import { createStorySubscription } from "../../../domains/stories/browser/index";
import {
  type ConnectionState,
  connectionStates,
  type DeliveryReceiver,
  type EventHandlers,
} from "../../../lib/realtime/index";
import type { RealtimeHostDependencies } from "./types";

/**
 * Создаёт принадлежащий account host поток с unread subscription и проекцией connection
 * state; dispose снимает подписки и инициирует закрытие транспорта с обработкой ошибки.
 */
export const createAccountStream = ({
  auth,
  refreshStories,
  unread,
  create,
  origin,
  uuid,
  observe,
  handlers,
  delivery,
  onGenerationLost,
  state,
}: RealtimeHostDependencies &
  Readonly<{
    handlers: EventHandlers;
    delivery: DeliveryReceiver;
    state: Writable<ConnectionState>;
    onGenerationLost: () => void;
  }>) => {
  const subscription = createUnreadSubscription({
    /**
     * Отправляет команду account unread subscription через созданное соединение и возвращает его
     * исход.
     */
    command: (value) => connection.command(value),
    unread,
    uuid,
    /**
     * При отказе авторизации сверяет browser session; ошибку reconciliation передаёт private
     * cleanup диагностике.
     */
    onUnauthorized: () =>
      auth.reconcile().catch(auth.reportPrivateCleanupFailure),
  });
  const stories = refreshStories
    ? createStorySubscription({
        command: (value) => connection.command(value),
        refresh: refreshStories,
        uuid,
        report: auth.reportPrivateCleanupFailure,
      })
    : null;
  const connection = create({
    url: origin(),
    auth,
    observe,
    handlers,
    delivery: {
      receive: async (unit, active) =>
        (await subscription.delivery.receive(unit, active)) ??
        (await stories?.delivery.receive(unit, active)) ??
        delivery.receive(unit, active),
      notice: (notice, active) =>
        subscription.delivery.notice(notice, active) ??
        stories?.delivery.notice(notice, active) ??
        delivery.notice(notice, active),
    },
    /**
     * Инвалидирует account subscription при потере поколения соединения и уведомляет
     * заимствовавших host потребителей.
     */
    onGenerationLost: () => {
      subscription.lost();
      stories?.lost();
      onGenerationLost();
    },
  });
  const releaseState = connection.viewState.subscribe((value) => {
    state.set(value);
    if (value.kind === connectionStates.connected) {
      subscription.connected().catch(unread.reportUnavailable);
      stories?.ensure().catch(auth.reportPrivateCleanupFailure);
    }
  });
  return {
    connection,
    retryUnread: subscription.retry,
    /**
     * Восстанавливает account subscription на действующем соединении; ошибку сообщает unread
     * summary.
     */
    resumeSubscription: () => {
      subscription.ensure().catch(unread.reportUnavailable);
      stories?.ensure().catch(auth.reportPrivateCleanupFailure);
    },
    /**
     * Снимает проекцию connection state, освобождает unread subscription и инициирует закрытие
     * своего connection; асинхронный сбой сообщает auth owner.
     */
    dispose: () => {
      releaseState();
      subscription.dispose();
      stories?.dispose();
      connection.dispose().catch(auth.reportPrivateCleanupFailure);
    },
  };
};
