import type { PublicPreference } from "@insta/contracts/privacy";
import { createClientObserver } from "../../../lib/observability/browser/index";
import { clientOperations } from "../../../lib/observability/client/index";

/**
 * Собирает браузерные telemetry adapters с ленивой загрузкой Faro; callbacks каждый раз
 * читают актуальное согласие, владение lifecycle адаптеров остаётся у privacy.
 */
export const createTelemetryBrowser = (
  readPreference: () => PublicPreference,
) => {
  const observer = createClientObserver();
  return {
    adapters: [
      async () => observer.adapter(readPreference()),
      async () => {
        const { loadFaroAdapter } = await import(
          "../../../lib/observability/browser/faro"
        );
        return loadFaroAdapter({ preference: readPreference() });
      },
    ],
    /**
     * Регистрирует факт воспроизведения Story только при текущем полном согласии с положительной
     * revision; без согласия возвращает false.
     */
    observeStoryPlayback: () => {
      const preference = readPreference();
      if (preference.choice !== "all" || preference.revision <= 0) return false;
      return observer.record({
        operation: clientOperations.storyPlayback,
        code: "PLAYING",
        operationId: crypto.randomUUID(),
      });
    },
    /**
     * При текущем полном согласии записывает только connected/disconnected переходы;
     * промежуточные состояния не создают telemetry событие.
     */
    observeConnection: (kind: string) => {
      const preference = readPreference();
      if (preference.choice !== "all" || preference.revision <= 0) return;
      if (kind === "connected" || kind === "disconnected")
        observer.record({
          operation: clientOperations.realtime,
          code: kind === "connected" ? "CONNECTED" : "DISCONNECTED",
        });
    },
  };
};
