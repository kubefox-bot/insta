import { Result } from "@bloodyowl/boxed";
import type { BrowserOwner } from "./types";
/**
 * Останавливает телеметрию перед чтением согласия, применяет только актуальный ответ; при
 * ошибке сохраняет локальный запрет и повторяет остановку.
 */
export const refreshPreference = async ({
  state,
  view,
  preferences,
  telemetry,
}: BrowserOwner) => {
  const epoch = ++state.epoch;
  const lifetime = state.lifetime;
  /**
   * Проверяет одновременно поколение запроса, lifetime и активный монтаж перед применением
   * результата.
   */
  const isCurrent = () =>
    epoch === state.epoch && lifetime === state.lifetime && state.mounted;
  const refreshed = await Result.fromPromise(
    (async () => {
      await telemetry.stop();
      if (!isCurrent()) return;
      const fresh = await preferences.read();
      if (!isCurrent()) return;
      state.current = state.locallyDenied
        ? { ...fresh, choice: "necessary" }
        : fresh;
      const status = state.locallyDenied ? "error" : "ready";
      view.set({ preference: state.current, status });
      await telemetry.start(state.current);
    })(),
  );
  if (refreshed.isOk() || !isCurrent()) return;
  state.locallyDenied = true;
  state.current = { ...state.current, choice: "necessary" };
  view.set({ preference: state.current, status: "error" });
  // The optional telemetry owner retains failed releases for a later retry.
  const cleaned = await Result.fromPromise(telemetry.stop());
  if (cleaned.isError() && isCurrent())
    view.set({ preference: state.current, status: "error" });
};
