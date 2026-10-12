import { get } from "svelte/store";
import type {
  ConversationActor,
  ConversationStore,
  SynchronizationOutcome,
} from "../../../domains/conversations/browser/index";
import { createConversationSubscription } from "../../../domains/conversations/browser/realtime/index";
import type { AuthBrowser } from "../../../domains/users/browser/index";
import { connectionStates } from "../../../lib/realtime/index";
import {
  createApplicationRealtime,
  type RealtimeHost,
} from "../../realtime/browser/index";
import { connectionStatus } from "./conts";
/**
 * Связывает conversation subscription с заимствованным realtime host либо собственным
 * соединением; dispose заимствованного connection освобождает listener, а собственного —
 * транспорт.
 */
export const createConversationRealtime = ({
  actor,
  auth,
  store,
  observe,
  onMessage,
  realtimeHost,
  recover,
}: Readonly<{
  actor: ConversationActor;
  auth: AuthBrowser;
  store: ConversationStore;
  observe?: (kind: string) => void;
  onMessage?: () => void;
  realtimeHost?: RealtimeHost;
  recover: (id: string) => Promise<SynchronizationOutcome>;
}>) => {
  const subscription = createConversationSubscription({
    actor,
    recover,
    /**
     * Передаёт команду подписки выбранному connection, сохраняя его Promise и ошибки.
     */
    command: (value) => connection.command(value),
    /**
     * Проверяет фактический connected статус перед работой conversation subscription.
     */
    connected: () =>
      get(connection.viewState).kind === connectionStates.connected,
    store,
    /**
     * Читает браузерный online hint для политики подписки; это не проверка доступности backend.
     */
    online: () => navigator.onLine,
  });
  const options = {
    actor,
    url: location.origin,
    auth,
    ...(observe ? { observe } : {}),
    handlers: subscription.handlers,
    delivery: subscription.delivery,
    onGenerationLost: subscription.onGenerationLost,
  };
  const connection = realtimeHost
    ? realtimeHost.borrow(options)
    : createApplicationRealtime(options);
  return {
    connection: {
      ...connection,
      dispose: async () => {
        await subscription.dispose();
        await connection.dispose();
      },
    },
    retry: (id: string) => subscription.retry(id),
    /**
     * Регистрирует получателя сообщений выбранного диалога; после успешной доставки получателю
     * вызывает дополнительную инвалидацию и возвращает освобождение подписки.
     */
    subscribe: (
      id: string,
      receive: Parameters<typeof subscription.subscribe>[1],
      options?: Parameters<typeof subscription.subscribe>[2],
    ) =>
      subscription.subscribe(
        id,
        (message) => {
          receive(message);
          onMessage?.();
        },
        options,
      ),
    connectionStatus,
  };
};
