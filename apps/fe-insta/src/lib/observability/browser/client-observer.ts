import type { PublicPreference } from "@insta/contracts/privacy";
import { clientEndpoint, type clientOperations } from "../client/conts";
import { createBrowserSender } from "./transport";
/**
 * Связывает запись клиентских наблюдений с sender, которым управляет внешний privacy
 * lifecycle. До start запись отключена; вызывающий обязан выполнить stop перед clear,
 * чтобы дождаться активных отправок.
 */
export const createClientObserver = () => {
  let active: ReturnType<typeof createBrowserSender> | undefined;
  return {
    /**
     * Связывает lifecycle sender со снимком preference; сама фабрика не проверяет согласие
     * и не отправляет события.
     */
    adapter: (preference: PublicPreference) => ({
      /**
       * Создаёт sender для client intake с revision и policyVersion данного preference;
       * согласие до запуска проверяет владелец lifecycle.
       */
      start: () => {
        active = createBrowserSender({
          endpoint: clientEndpoint,
          ...preference,
        });
      },
      /**
       * Сначала отключает новые записи, затем отменяет запросы прежнего sender и ждёт их
       * settlement.
       */
      stop: async () => {
        const owned = active;
        active = undefined;
        await owned?.stop();
      },
      /**
       * Удаляет ссылку на активный sender без отмены запросов; освобождение ресурсов
       * выполняется отдельным stop.
       */
      clear: () => {
        active = undefined;
      },
    }),
    /**
     * При активном sender запускает best-effort отправку наблюдения с новым
     * analyticsEventId и поглощает отклонение Promise. true означает запуск отправки, а не
     * приём сервером; без sender возвращает false.
     */
    record: (
      input: Readonly<{
        operation:
          | typeof clientOperations.realtime
          | typeof clientOperations.storyPlayback;
        code: "CONNECTED" | "DISCONNECTED" | "PLAYING";
        operationId?: string;
      }>,
    ) => {
      const owned = active;
      if (!owned) return false;
      owned
        .send({
          events: [{ analyticsEventId: crypto.randomUUID(), ...input }],
        })
        .catch(() => {});
      return true;
    },
  };
};
