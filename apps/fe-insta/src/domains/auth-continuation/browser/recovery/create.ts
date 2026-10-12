import { readonly } from "svelte/store";
import type {
  Recovery,
  RecoveryDependencies,
} from "../../ports/recovery/types";
import { beginRecovery } from "./begin";
import { cancelRecovery, rejectRecovery, restoreRecovery } from "./completion";
import { reconcileRecovery, suspendRecovery } from "./identity";
import { createRecoveryLifecycle } from "./lifecycle";
import { explicitLogout } from "./logout";
import { chooseAuthentication, confirmRegistration } from "./registration";
/**
 * Собирает публичный recovery API над единым владельцем selection lifetime и временного
 * payload; view остаётся читаемым, dispose освобождает связи и данные.
 */
export const createRecovery = (
  dependencies: RecoveryDependencies,
): Recovery => {
  const lifecycle = createRecoveryLifecycle(dependencies.pending);
  const operations = { ...dependencies, ...lifecycle };
  return {
    view: readonly(lifecycle.view),
    /**
     * Передаёт явный выбор login/register политике сохранения intent после регистрации.
     */
    chooseAuthentication: (input) => chooseAuthentication(operations, input),
    /**
     * Подтверждает выбранный регистрацией intent перед возможной сменой владельца metadata.
     */
    confirmRegistration: (intentId) =>
      confirmRegistration(operations, intentId),
    /**
     * Запускает или переиспользует выбор intent через общий recovery lifetime.
     */
    begin: (input) => beginRecovery(operations, input),
    connectStory: lifecycle.connectStory,
    connect: lifecycle.connect,
    /**
     * Передаёт явный logout для блокировки старого поколения и удаления recovery.
     */
    explicitLogout: (identity) => explicitLogout(operations, identity),
    /**
     * Сохраняет доступный текст или preview прежней identity для последующего явного
     * восстановления.
     */
    suspend: (identity) => suspendRecovery(operations, identity),
    /**
     * Согласует recovery с новой identity, удаляя чужие данные или создавая intent при
     * переходе в guest.
     */
    reconcile: (identity) => reconcileRecovery(operations, identity),
    /**
     * Восстанавливает payload только через проверки текущего intent и actor.
     */
    restore: (input) => restoreRecovery(operations, input),
    /**
     * Показывает отказ продолжения только для совпадающего выбранного intent.
     */
    reject: (intentId) => rejectRecovery(operations, intentId),
    /**
     * Передаёт выбранный intent сценарию локальной и серверной отмены.
     */
    cancel: (intentId) => cancelRecovery(operations, intentId),
    dispose: lifecycle.dispose,
  };
};
