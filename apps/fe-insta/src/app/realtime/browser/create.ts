import {
  type AuthBrowser,
  obtainWsTicket,
} from "../../../domains/users/browser/realtime/index";
import {
  createConnection,
  type DeliveryReceiver,
  type EventHandlers,
} from "../../../lib/realtime/index";
/**
 * Создаёт собственное ticket-based realtime соединение и регистрирует его в auth private
 * cleanup; явный dispose снимает регистрацию и ждёт закрытие транспорта.
 */
export const createApplicationRealtime = ({
  url,
  auth,
  handlers,
  delivery,
  onGenerationLost,
  observe,
}: Readonly<{
  url: string;
  auth: AuthBrowser;
  handlers: EventHandlers;
  delivery: DeliveryReceiver;
  onGenerationLost: () => void;
  observe?: (kind: string) => void;
}>) => {
  const connection = createConnection({
    url,
    obtainTicket: obtainWsTicket,
    online: () => navigator.onLine,
    handlers,
    delivery,
    onGenerationLost,
    /**
     * Передаёт наблюдателю только kind изменения соединения, не раскрывая внутреннее состояние
     * транспорта.
     */
    observe: (value) => observe?.(value.kind),
    /**
     * Сверяет auth сессию после unauthorized realtime ответа и сообщает ошибку сверки через
     * private cleanup диагностику.
     */
    onUnauthorized: () => {
      auth.reconcile().catch(() => auth.reportPrivateCleanupFailure());
    },
  });
  const release = auth.registerPrivate(() => {
    connection.dispose().catch(() => auth.reportPrivateCleanupFailure());
  });
  return {
    ...connection,
    /**
     * Снимает auth cleanup регистрацию и дожидается освобождения принадлежащего адаптеру
     * connection.
     */
    dispose: async () => {
      release();
      await connection.dispose();
    },
  };
};
