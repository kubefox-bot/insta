import { get } from "svelte/store";
import type { RecoveryIdentity } from "../../ports/recovery/types";
import { invalidIdentity } from "./identity-policy";
import { discardPreviousOwner } from "./registration";
import { createSelected } from "./selection";
import { discardForeignStory, suspendStory } from "./story";
import type { RecoveryOperations } from "./types";
/**
 * При потере сессии сохраняет preview или непустой текст только прежнего совпадающего actor;
 * pending logout очищает всё, заблокированное поколение не восстанавливает.
 */
export const suspendRecovery = (
  operations: Pick<
    RecoveryOperations,
    "state" | "discardAll" | "retire" | "uuid" | "pending" | "view" | "payload"
  >,
  identity: RecoveryIdentity,
) => {
  const { state, discardAll, retire, uuid, pending, view, payload } =
    operations;
  if (identity.status === "pending") {
    discardAll();
    return;
  }
  if (state.disposed || !identity.actor) return;
  if (identity.actor.generation === state.blockedGeneration) return;
  if (suspendStory(operations, identity)) return;
  const snapshot = payload.source?.capture();
  if (
    !snapshot?.text ||
    snapshot.actor.userId !== identity.actor.userId ||
    snapshot.actor.generation !== identity.actor.generation
  )
    return;
  retire();
  const key = uuid();
  pending.remember({
    intentId: key,
    text: snapshot.text,
    expectedUserId: snapshot.actor.userId,
  });
  payload.suspended = {
    kind: "message",
    actor: snapshot.actor,
    recipientId: snapshot.recipientId,
    key,
  };
  view.set({ kind: "creating" });
};
/**
 * Согласует identity с recovery: удаляет чужие и недопустимые данные, завершает при возврате
 * прежнего поколения, а для guest в creating запускает создание intent.
 */
export const reconcileRecovery = (
  operations: Pick<
    RecoveryOperations,
    | "state"
    | "discardAll"
    | "view"
    | "retire"
    | "payload"
    | "now"
    | "expire"
    | "create"
    | "cancel"
    | "onCleanupFailure"
    | "pending"
  >,
  identity: RecoveryIdentity,
) => {
  const { state, discardAll, view, retire, payload } = operations;
  state.identity = identity;
  if (discardForeignStory(operations, identity)) return;
  if (invalidIdentity(state, identity)) {
    discardAll();
    return;
  }
  if (
    identity.actor &&
    payload.suspended &&
    identity.actor.userId !== payload.suspended.actor.userId
  ) {
    discardPreviousOwner(operations, identity.actor);
    return;
  }
  if (
    identity.actor &&
    identity.actor.generation === payload.suspended?.actor.generation
  ) {
    if (payload.suspended?.kind === "story") payload.suspended = undefined;
    retire();
    return;
  }
  if (identity.status === "guest" && get(view).kind === "creating")
    createSelected(operations).catch(() => {
      retire();
      view.set({ kind: "unavailable" });
    });
};
