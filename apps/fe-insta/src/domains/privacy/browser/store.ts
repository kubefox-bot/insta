import type { PublicPreference } from "@insta/contracts/privacy";
import { derived, writable } from "svelte/store";
import type { OptionalTelemetry } from "../ports/optional-telemetry";
import type { Preferences } from "../ports/preferences";
import { createChange } from "./change";
import { refreshPreference } from "./refresh";
import type {
  BrowserOwner,
  PreferenceState,
  PrivacyBrowser,
  Synchronization,
} from "./types";
/**
 * Владеет состоянием согласия и подключением синхронизации; возвращает читаемое представление
 * и операции изменения, обновления и монтажа.
 */
export const createPrivacyBrowser = (
  input: Readonly<{
    initial: PublicPreference;
    preferences: Preferences;
    telemetry: OptionalTelemetry;
    synchronization: Synchronization;
  }>,
): PrivacyBrowser => {
  const owner: BrowserOwner = {
    ...input,
    state: {
      current: input.initial,
      epoch: 0,
      lifetime: 0,
      mutationEpoch: 0,
      locallyDenied: false,
      mounted: false,
    },
    view: writable<PreferenceState>({
      preference: input.initial,
      status: "ready",
    }),
  };
  const change = createChange(owner);
  /**
   * Перечитывает серверный выбор через владельца, который останавливает телеметрию и
   * отбрасывает устаревшие ответы.
   */
  const refresh = () => refreshPreference(owner);
  /**
   * Оставляет локально необходимый режим и показывает ошибку после неудачной остановки
   * телеметрии.
   */
  const fail = () => {
    owner.state.current = { ...owner.state.current, choice: "necessary" };
    owner.view.set({ preference: owner.state.current, status: "error" });
  };
  /**
   * Подписывает единственный активный монтаж на изменения согласия; возвращённая очистка
   * инвалидирует ответы, снимает подписку и запрашивает асинхронную остановку телеметрии.
   */
  const mount = () => {
    if (owner.state.mounted) throw new Error("Privacy browser already mounted");
    owner.state.mounted = true;
    const lifetime = ++owner.state.lifetime;
    /**
     * Запускает обновление только для ещё активного поколения монтажа, чтобы старая подписка
     * не меняла новый экран.
     */
    const update = () => {
      if (owner.state.lifetime !== lifetime || !owner.state.mounted) return;
      void refresh();
    };
    const unsubscribe = owner.synchronization.subscribe(update);
    update();
    return () => {
      if (owner.state.lifetime !== lifetime || !owner.state.mounted) return;
      owner.state.mounted = false;
      const releasedLifetime = ++owner.state.lifetime;
      const releasedEpoch = ++owner.state.epoch;
      ++owner.state.mutationEpoch;
      unsubscribe();
      owner.telemetry.stop().catch(() => {
        if (
          owner.state.lifetime !== releasedLifetime ||
          owner.state.epoch !== releasedEpoch
        )
          return;
        owner.state.locallyDenied = true;
        fail();
      });
    };
  };
  return {
    view: derived(owner.view, (value) => ({
      ...value,
      needsChoice: value.preference.revision === 0,
    })),
    change,
    refresh,
    mount,
  };
};
