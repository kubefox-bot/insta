import { z } from "zod";
import { outboxChannelName } from "../domain/conts";

const noticeSchema = z.object({ kind: z.literal("changed") });
/** Открывает межвкладочный канал без содержимого сообщений; при отсутствии API сохраняет локальную регистрацию слушателей. */
export const createOutboxBroadcast = () => {
  const channel =
    typeof BroadcastChannel === "undefined"
      ? undefined
      : new BroadcastChannel(outboxChannelName);
  const listeners = new Set<() => void>();
  if (channel)
    channel.onmessage = ({ data }) => {
      if (noticeSchema.safeParse(data, { jitless: true }).success)
        for (const listener of listeners) listener();
    };
  return {
    /** Посылает соседним вкладкам только уведомление об изменении очереди. */
    publish: () => channel?.postMessage({ kind: "changed" }),
    /** Регистрирует слушателя валидных внешних уведомлений и возвращает удаление этой регистрации. */
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Очищает локальных слушателей и закрывает принадлежащий адаптеру канал. */
    close: () => {
      listeners.clear();
      channel?.close();
    },
  };
};
