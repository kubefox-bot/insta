import {
  type BrowserChannel,
  openBrowserChannel,
  withBrowserLock,
} from "../../../lib/browser-synchronization";
import { consentChannel, consentLock, consentNotice } from "./conts";
import type { Synchronization } from "./types";
/**
 * Связывает изменения согласия между вкладками через общий lock и канал; ресурс канала
 * освобождает результат subscribe.
 */
export const createBrowserSynchronization = (): Synchronization => {
  const state: { channel?: BrowserChannel } = {};
  return {
    /**
     * Сериализует сохранение согласия доступным браузерным механизмом блокировки.
     */
    exclusive: (execute) => withBrowserLock({ name: consentLock, execute }),
    /**
     * Сообщает другим вкладкам об изменении выбора, если канал подписки открыт.
     */
    publish: () => state.channel?.publish(consentNotice),
    /**
     * Открывает канал согласия и обновление по фокусу; возвращает очистку именно этого канала.
     */
    subscribe: (refresh) => {
      const channel = openBrowserChannel({
        name: consentChannel,
        /**
         * Перечитывает предпочтение только для сообщения протокола согласия.
         */
        onMessage: (data) => {
          if (data === consentNotice) refresh();
        },
        onFocus: refresh,
      });
      state.channel = channel;
      return () => {
        channel.close();
        if (state.channel === channel) state.channel = undefined;
      };
    },
  };
};
