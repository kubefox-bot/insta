import {
  realtimePolicy,
  withPublicationSignal,
} from "../../../../lib/realtime/index";
import type { GatewayDependencies, Recipient } from "./types";
/**
 * Владеет таймером access-expiry и непересекающимися проверками canonical session; ошибки
 * отключают socket, close снимает таймеры и ждёт текущую проверку.
 */
export const watchSession = ({
  recipient,
  authorize,
}: Readonly<{
  recipient: Recipient;
  authorize: GatewayDependencies["authorize"];
}>) => {
  const lifetime = new AbortController();
  let stopping = false;
  let checking = false;
  let pending: Promise<void> = Promise.resolve();
  const expiry = setTimeout(
    () => recipient.socket.disconnect(true),
    Math.max(0, recipient.actor.accessExpiresAt - Date.now()),
  );
  const interval = setInterval(() => {
    if (checking || stopping) return;
    checking = true;
    pending = withPublicationSignal({
      signal: lifetime.signal,
      /**
       * Проверяет actor через auth-порт с сигналом lifetime текущей публикационной
       * проверки.
       */
      execute: (signal) => authorize({ actor: recipient.actor, signal }),
    })
      .then(
        (result) => {
          if (result.isError()) recipient.socket.disconnect(true);
        },
        () => {
          recipient.socket.disconnect(true);
        },
      )
      .finally(() => {
        checking = false;
      });
  }, realtimePolicy.sessionCheckIntervalMs);
  return {
    /**
     * Останавливает новые session probes, снимает оба таймера, отменяет lifetime и ждёт
     * уже выполняющуюся проверку.
     */
    close: async () => {
      stopping = true;
      clearTimeout(expiry);
      clearInterval(interval);
      lifetime.abort();
      await pending;
    },
  };
};
