import { get } from "svelte/store";
import type { Recovery } from "../../ports/recovery/types";
import { createSelected } from "./selection";
import type { RecoveryOperations } from "./types";
/**
 * Начинает выбранный intent, переиспользуя незавершённое создание или живую квитанцию того же
 * operationId; новый выбор завершает прежний lifetime и запоминает текущего actor.
 */
export const beginRecovery = (
  operations: Pick<
    RecoveryOperations,
    | "state"
    | "view"
    | "retire"
    | "now"
    | "payload"
    | "create"
    | "cancel"
    | "onCleanupFailure"
    | "pending"
    | "expire"
  >,
  { input }: Parameters<Recovery["begin"]>[0],
) => {
  const { state, view, retire, now } = operations;
  if (state.disposed) return Promise.resolve(undefined);
  if (state.selectedInput?.operationId === input.operationId) {
    if (state.selection) return state.selection;
    const selected = get(view);
    if (selected.kind === "ready" && selected.expiresAt > now())
      return Promise.resolve(selected);
  }
  retire();
  state.metadataActor = state.identity.actor ?? undefined;
  state.selectedInput = input;
  view.set({ kind: "creating" });
  const selection = createSelected(operations);
  state.selection = selection;
  return selection;
};
