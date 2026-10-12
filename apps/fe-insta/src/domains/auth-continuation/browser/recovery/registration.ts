import { get } from "svelte/store";
import type { Actor } from "../../domain/types";
import type { Recovery } from "../../ports/recovery/types";
import { selectMetadata } from "./metadata";
import type { RecoveryOperations } from "./types";

/**
 * Запоминает явный выбор register только для текущего готового intent; другой режим или
 * несовпадение удаляет разрешение переноса.
 */
export const chooseAuthentication = (
  { state, view }: Pick<RecoveryOperations, "state" | "view">,
  { mode, intentId }: Parameters<Recovery["chooseAuthentication"]>[0],
) => {
  const selected = get(view);
  state.registrationSelection =
    mode === "register" &&
    selected.kind === "ready" &&
    selected.intentId === intentId
      ? { intentId: selected.intentId, phase: "chosen" }
      : undefined;
};

/**
 * Очищает данные прежнего владельца, сохраняя лишь неистёкшие metadata intent с явно
 * подтверждённой регистрацией, и привязывает их к новому actor.
 */
export const discardPreviousOwner = (
  operations: Pick<
    RecoveryOperations,
    "state" | "view" | "discardAll" | "now" | "expire"
  >,
  actor: Actor,
) => {
  const { state, view, discardAll, now } = operations;
  const selected = get(view);
  const retained =
    selected.kind === "ready" &&
    selected.intentId === state.registrationSelection?.intentId &&
    state.registrationSelection.phase === "confirmed" &&
    selected.expiresAt > now()
      ? selected
      : undefined;
  discardAll();
  if (!retained) return;
  state.metadataActor = actor;
  selectMetadata(operations, retained);
};

/**
 * Подтверждает ранее выбранный для регистрации intent только пока он текущий и не истёк; это
 * разрешение переноса metadata, не автоматическая отправка payload.
 */
export const confirmRegistration = (
  { state, view, now }: Pick<RecoveryOperations, "state" | "view" | "now">,
  intentId?: string | null,
) => {
  const selected = get(view);
  if (
    state.registrationSelection?.phase !== "chosen" ||
    state.registrationSelection.intentId !== intentId ||
    selected.kind !== "ready" ||
    selected.intentId !== intentId ||
    selected.expiresAt <= now()
  )
    return;
  state.registrationSelection = { intentId, phase: "confirmed" };
};
