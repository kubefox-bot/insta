import { get } from "svelte/store";
import { safeTarget } from "../../domain/intent";
import type { Recovery } from "../../ports/recovery/types";
import { cancelReceipt } from "./cancel-receipt";
import { restoreStory } from "./story";
import type { RecoveryOperations } from "./types";
/**
 * Восстанавливает локальный текст или preview только для текущего живого intent и совпадающей
 * authenticated identity, затем завершает выбор; не отправляет текст и не публикует Stories.
 */
export const restoreRecovery = (
  operations: Pick<
    RecoveryOperations,
    "state" | "view" | "pending" | "retire" | "payload" | "now"
  >,
  { intentId, target, actor }: Parameters<Recovery["restore"]>[0],
) => {
  const { state, view, pending, retire, payload, now } = operations;
  const selected = get(view);
  if (
    state.disposed ||
    selected.kind !== "ready" ||
    selected.intentId !== intentId
  )
    return;
  if (selected.expiresAt <= now()) {
    retire();
    view.set({ kind: "unavailable" });
    return;
  }
  if (
    !safeTarget(target) ||
    state.identity.status !== "authenticated" ||
    state.identity.actor?.userId !== actor.userId ||
    state.identity.actor.generation !== actor.generation
  ) {
    retire();
    return;
  }
  if (target.type === "create_story" || target.type === "resume_story") {
    restoreStory(operations, actor);
    retire();
    return;
  }
  const text = pending.take({ intentId, actorId: actor.userId });
  if (text !== undefined && target.type === "compose_message")
    payload.source?.restore({
      actor,
      conversationId: target.conversationId,
      text,
    });
  retire();
};
/**
 * Удаляет локальный pending-payload отменяемого intent до серверной отмены; текущий выбор
 * снимает только при совпадении intent. Отказ отмены
 * показывает лишь для ещё актуального lifetime и не восстанавливает удалённые данные.
 */
export const cancelRecovery = async (
  {
    state,
    view,
    pending,
    retire,
    cancel,
    onCleanupFailure,
  }: Pick<
    RecoveryOperations,
    "state" | "view" | "pending" | "retire" | "cancel" | "onCleanupFailure"
  >,
  intentId?: string | null,
) => {
  const selected = get(view);
  const chosen =
    intentId ?? (selected.kind === "ready" ? selected.intentId : undefined);
  if (!chosen) {
    retire();
    return;
  }
  pending.cancel(chosen);
  if (selected.kind === "ready" && selected.intentId === chosen) retire();
  const epoch = state.epoch;
  const cancelled = await cancelReceipt({ cancel, onCleanupFailure }, chosen);
  if (
    !cancelled &&
    !state.disposed &&
    state.epoch === epoch &&
    selected.kind !== "creating" &&
    (selected.kind !== "ready" || selected.intentId === chosen)
  )
    view.set({ kind: "unavailable" });
};

/**
 * Переводит именно текущий готовый intent в unavailable, освобождая его lifetime и временные
 * ресурсы.
 */
export const rejectRecovery = (
  { view, retire }: Pick<RecoveryOperations, "view" | "retire">,
  intentId: string,
) => {
  const selected = get(view);
  if (selected.kind !== "ready" || selected.intentId !== intentId) return;
  retire();
  view.set({ kind: "unavailable" });
};
