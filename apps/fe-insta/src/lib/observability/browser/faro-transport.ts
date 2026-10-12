import type { TransportItem } from "@grafana/faro-web-sdk";
import { faroTransport } from "../client/conts";
import { sanitizeFaro } from "./sanitize-faro";
/**
 * Создаёт транспорт SDK, передающий наружу только результат sanitizeFaro через
 * внедрённый sender. Сам транспорт не проверяет consent; его подключает разрешённый
 * privacy lifecycle.
 */
export const createFaroTransport = ({
  sdk,
  send,
}: Readonly<{
  sdk: typeof import("@grafana/faro-web-sdk");
  send: (payload: Readonly<Record<string, unknown>>) => Promise<void>;
}>) => {
  class SanitizedTransport extends sdk.BaseTransport {
    readonly name = faroTransport.name;
    readonly version = faroTransport.version;
    /**
     * Последовательно очищает элементы Faro, пропускает неподдерживаемые и присваивает
     * каждому принятому событию новый analyticsEventId. Ждёт send; его ошибка прерывает
     * остаток партии и передаётся вызывающему.
     */
    send = async (items: TransportItem | TransportItem[]) => {
      for (const item of Array.isArray(items) ? items : [items]) {
        const body = sanitizeFaro(item);
        if (body) await send({ analyticsEventId: crypto.randomUUID(), body });
      }
    };
  }
  return new SanitizedTransport();
};
