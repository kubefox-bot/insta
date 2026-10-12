import {
  type BrowserChannel,
  openBrowserChannel,
  withBrowserLock,
} from "../../../lib/browser-synchronization";
import { authChannel, authLock, authLogoutNotice, authNotice } from "./conts";
import { createAuthNoticeReceiver } from "./lib/notice";
import type { AuthSynchronization } from "./types";
/**
 * Связывает auth между вкладками общей блокировкой и каналом уведомлений; cleanup подписки
 * закрывает приобретённый канал.
 */
export const createAuthSynchronization = (): AuthSynchronization => {
  const state: { channel?: BrowserChannel } = {};
  return {
    /**
     * Выполняет auth-операцию под доступным браузерным lock для синхронизации вкладок.
     */
    exclusive: (execute) => withBrowserLock({ name: authLock, execute }),
    /**
     * Уведомляет подключённые вкладки о необходимости перечитать сессию.
     */
    publish: () => state.channel?.publish(authNotice),
    /**
     * Сообщает о явном logout до последующего согласования сессии.
     */
    publishLogout: () => state.channel?.publish(authLogoutNotice),
    /**
     * Подписывает auth на сообщения и фокус окна; возвращённая очистка закрывает именно
     * созданный канал.
     */
    subscribe: (refresh, onExplicitLogout) => {
      const receive = createAuthNoticeReceiver({ refresh, onExplicitLogout });
      const channel = openBrowserChannel({
        name: authChannel,
        /**
         * Передаёт данные канала обработчику известных auth/logout-сообщений.
         */
        onMessage: (data) => receive({ data }),
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
