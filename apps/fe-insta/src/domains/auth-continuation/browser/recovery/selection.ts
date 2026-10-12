import { cancelReceipt } from "./cancel-receipt";
import { selectionInput } from "./input";
import { selectMetadata } from "./metadata";
import type { RecoveryOperations } from "./types";

/**
 * Привязывает локальный suspended payload к выданному intentId: текст переносит между
 * pending-ключами, preview меняет только ключ; затем публикует metadata и expiry.
 */
const selectReceipt = (
  operations: Pick<
    RecoveryOperations,
    "pending" | "payload" | "view" | "expire"
  >,
  receipt: Readonly<{ intentId: string; expiresAt: number }>,
) => {
  const { pending, payload } = operations;
  const suspended = payload.suspended;
  if (!suspended) {
    selectMetadata(operations, receipt);
    return;
  }
  if (suspended.kind === "story") {
    payload.suspended = { ...suspended, key: receipt.intentId };
    selectMetadata(operations, receipt);
    return;
  }
  const text = pending.take({
    intentId: suspended.key,
    actorId: suspended.actor.userId,
  });
  if (text !== undefined)
    pending.remember({
      intentId: receipt.intentId,
      text,
      expectedUserId: suspended.actor.userId,
    });
  payload.suspended = { ...suspended, key: receipt.intentId };
  selectMetadata(operations, receipt);
};
/**
 * Создаёт один intent текущего lifetime, применяя только свой ответ; позднюю квитанцию
 * пытается отменить на сервере, а отсутствие квитанции освобождает выбор и показывает
 * unavailable.
 */
export const createSelected = async (
  operations: Pick<
    RecoveryOperations,
    | "state"
    | "create"
    | "cancel"
    | "onCleanupFailure"
    | "view"
    | "retire"
    | "payload"
    | "pending"
    | "expire"
  >,
) => {
  const { state, create, view, retire, payload } = operations;
  const input = selectionInput({
    selectedInput: state.selectedInput,
    suspended: payload.suspended,
  });
  if (!input || state.creating || state.disposed) return;
  state.creating = true;
  state.selectedInput = input;
  const epoch = state.epoch;
  const receipt = await create(input).catch(() => undefined);
  if (state.disposed || state.epoch !== epoch) {
    if (receipt) await cancelReceipt(operations, receipt.intentId);
    return;
  }
  state.creating = false;
  if (!receipt) {
    retire();
    view.set({ kind: "unavailable" });
    return;
  }
  selectReceipt(operations, receipt);
  return receipt;
};
