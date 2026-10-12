import { readonly, writable } from "svelte/store";
import type { SelectionDependencies, SelectionInput } from "./types";

/**
 * Выбирает projected-intent раньше recovery-intent, исключая dismissed, cancelled и
 * недоступное восстановление.
 */
const selectIntent = ({
  recovery,
  projectedIntent,
  cancelled,
  dismissedIntent,
}: SelectionInput) => {
  const selected =
    projectedIntent ?? (recovery.kind === "ready" ? recovery.intentId : null);
  return recovery.kind !== "unavailable" &&
    selected !== dismissedIntent &&
    !cancelled
    ? selected
    : null;
};
/**
 * Владеет локальным dismissed-intent и соединяет выбор с внешней отменой без хранения payload.
 */
export const createContinuationSelection = ({
  cancel,
}: SelectionDependencies) => {
  const dismissed = writable<string | null>(null);
  return {
    view: readonly(dismissed),
    select: selectIntent,
    /**
     * Немедленно скрывает выбранный intent локально и передаёт отмену внешнему владельцу;
     * результат отмены возвращает вызывающему коду.
     */
    cancel: (intentId: string | null) => {
      dismissed.set(intentId);
      return cancel(intentId);
    },
  };
};
