import { realtimePolicy } from "../../../../lib/realtime/index";
import { observeCommand } from "./observe-command";
import type { GatewayDependencies, Recipient } from "./types";
/**
 * Владеет последовательной очередью команд socket и её AbortController; close снимает
 * listener, запрашивает отмену и ждёт очередь.
 */
export const receiveCommands = ({
  recipient,
  dependencies,
}: Readonly<{ recipient: Recipient; dependencies: GatewayDependencies }>) => {
  const lifetime = new AbortController();
  let sequence = Promise.resolve();
  let queued = 0;
  /**
   * Ставит команду в ограниченную последовательную очередь; переполнение или ошибка
   * отключают socket, callback ACK вызывается только при живом соединении.
   */
  const receive = (eventName: string, payload: unknown, callback: unknown) => {
    if (queued >= realtimePolicy.commandsPerMinute) {
      recipient.socket.disconnect(true);
      return;
    }
    queued++;
    sequence = sequence
      .then(async () => {
        if (!recipient.socket.connected || lifetime.signal.aborted) return;
        const ack = await observeCommand({
          eventName,
          payload,
          recipient,
          dependencies,
          signal: lifetime.signal,
        });
        if (typeof callback === "function" && recipient.socket.connected)
          callback(ack);
      })
      .catch(() => {
        recipient.socket.disconnect(true);
      })
      .finally(() => {
        queued--;
      });
  };
  recipient.socket.onAny(receive);
  return {
    /**
     * Прекращает приём команд, отменяет текущий lifetime и ждёт settlement цепочки,
     * включая пропуск ещё не начатых команд.
     */
    close: async () => {
      recipient.socket.offAny(receive);
      lifetime.abort();
      await sequence;
    },
  };
};
