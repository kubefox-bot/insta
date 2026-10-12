import type { Faro } from "@grafana/faro-web-sdk";
import type { PublicPreference } from "@insta/contracts/privacy";
import { faroEndpoint, faroValues } from "../client/conts";
import { observeBrowserErrors } from "./errors";
import { createFaroTransport } from "./faro-transport";
import { observePaint } from "./paint";
import { createBrowserSender } from "./transport";
/**
 * Собирает Faro sender и transport для снимка preference. Проверка разрешения
 * принадлежит загрузчику и privacy lifecycle; start приобретает подписки, stop
 * освобождает их и ждёт sender, clear только сбрасывает ссылку.
 */
export const createFaroRuntime = ({
  sdk,
  preference,
}: Readonly<{
  sdk: typeof import("@grafana/faro-web-sdk");
  preference: PublicPreference;
}>) => {
  const sender = createBrowserSender({ endpoint: faroEndpoint, ...preference });
  const transport = createFaroTransport({ sdk, send: sender.send });
  let instance: Faro | undefined;
  let disconnect: (() => void) | undefined;
  let releaseErrors: (() => void) | undefined;
  return {
    /**
     * Инициализирует изолированный Faro без session tracking, стандартных instrumentation и
     * metas; подключает обезличенные ошибки и новые paint-события. Lifecycle обязан вызвать
     * stop для освобождения этих подписок.
     */
    start: () => {
      instance = sdk.initializeFaro({
        isolate: true,
        preventGlobalExposure: true,
        app: { name: faroValues.appName },
        instrumentations: [],
        transports: [transport],
        sessionTracking: { enabled: false },
        batching: { enabled: false },
        metas: [],
        internalLoggerLevel: sdk.InternalLoggerLevel.OFF,
      });
      releaseErrors = observeBrowserErrors(() =>
        instance?.api.pushError(new Error(faroValues.unhandledError)),
      );
      disconnect = observePaint((values) =>
        instance?.api.pushMeasurement({ type: faroValues.webVitals, values }),
      );
    },
    /**
     * Снимает error/paint subscriptions, приостанавливает Faro и удаляет instrumentation и
     * transport. Затем отменяет отправки и ждёт sender.stop перед сбросом instance.
     */
    stop: async () => {
      releaseErrors?.();
      releaseErrors = undefined;
      disconnect?.();
      disconnect = undefined;
      instance?.pause();
      if (instance) {
        instance.instrumentations.remove(
          ...instance.instrumentations.instrumentations,
        );
        instance.transports.remove(transport);
      }
      await sender.stop();
      instance = undefined;
    },
    /**
     * Сбрасывает ссылку на Faro instance без освобождения подписок или sender; очистка
     * ресурсов требует отдельного stop.
     */
    clear: () => {
      instance = undefined;
    },
  };
};
