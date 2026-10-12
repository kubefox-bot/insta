import { writable } from "svelte/store";
import type { RecoveryView } from "../../../ports/recovery/types";
import type { RecoveryState } from "../types";

type Dependencies = Readonly<{
  now: () => number;
  schedule: (run: () => void, delayMs: number) => () => void;
  release: () => void;
}>;
/** Единственный владелец epoch, expiry и retirement выбранного intent. */
export const createSelectionLifetime = ({
  now,
  schedule,
  release,
}: Dependencies) => {
  const view = writable<RecoveryView>({ kind: "idle" });
  const state: RecoveryState = {
    identity: { actor: null, status: "guest" },
    epoch: 0,
    creating: false,
    disposed: false,
  };
  let cancelExpiry: (() => void) | undefined;
  /**
   * Инвалидирует epoch, отменяет expiry-таймер, освобождает выбранный payload и очищает
   * metadata/регистрационный выбор, возвращая view в idle.
   */
  const retire = () => {
    state.epoch++;
    cancelExpiry?.();
    cancelExpiry = undefined;
    release();
    state.creating = false;
    state.selectedInput = undefined;
    state.selection = undefined;
    state.registrationSelection = undefined;
    state.metadataActor = undefined;
    view.set({ kind: "idle" });
  };
  return {
    state,
    view,
    retire,
    now,
    /**
     * Заменяет таймер истечения intent; callback действует только в своём живом поколении,
     * освобождает выбор и показывает unavailable.
     */
    expire: (expiresAt: number) => {
      const epoch = state.epoch;
      cancelExpiry?.();
      cancelExpiry = schedule(
        () => {
          if (state.disposed || state.epoch !== epoch) return;
          retire();
          view.set({ kind: "unavailable" });
        },
        Math.max(0, expiresAt - now()),
      );
    },
    /**
     * Помечает lifetime закрытым для последующих callback; таймер и payload освобождает
     * отдельный retire в общей процедуре dispose.
     */
    dispose: () => {
      state.disposed = true;
    },
  };
};
