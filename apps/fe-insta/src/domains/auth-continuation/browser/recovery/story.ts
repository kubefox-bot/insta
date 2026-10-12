import type { RecoveryIdentity } from "../../ports/recovery/types";
import type { RecoveryOperations } from "./types";
/**
 * Захватывает opaque preview только совпадающего userId/generation, переиспользует уже
 * suspended preview либо создаёт новый ключ восстановления без копирования видео.
 */
export const suspendStory = (
  {
    payload,
    retire,
    uuid,
    view,
  }: Pick<RecoveryOperations, "payload" | "retire" | "uuid" | "view">,
  identity: RecoveryIdentity,
) => {
  const preview = payload.storyPreview?.capture();
  if (
    !preview ||
    preview.actor.userId !== identity.actor?.userId ||
    preview.actor.generation !== identity.actor.generation
  )
    return false;
  if (
    payload.suspended?.kind === "story" &&
    payload.suspended.previewId === preview.previewId
  )
    return true;
  retire();
  payload.suspended = { kind: "story", ...preview, key: uuid() };
  view.set({ kind: "creating" });
  return true;
};
/**
 * Удаляет recovery и preview при обнаружении другого пользователя; отсутствие actor/preview
 * или тот же пользователь не требуют очистки.
 */
export const discardForeignStory = (
  { payload, discardAll }: Pick<RecoveryOperations, "payload" | "discardAll">,
  identity: RecoveryIdentity,
) => {
  const preview = payload.storyPreview?.capture();
  if (
    !identity.actor ||
    !preview ||
    preview.actor.userId === identity.actor.userId
  )
    return false;
  discardAll();
  return true;
};

/**
 * Просит владельца preview восстановить указанный handle для actor; снимает suspended-ссылку
 * только после результата restored.
 */
export const restoreStory = (
  { payload }: Pick<RecoveryOperations, "payload">,
  actor: NonNullable<RecoveryIdentity["actor"]>,
) => {
  const suspended = payload.suspended;
  if (suspended?.kind !== "story") return;
  const restored = payload.storyPreview?.restore({
    actor,
    previewId: suspended.previewId,
  });
  if (restored === "restored") payload.suspended = undefined;
};
