import type { RecoveryIdentity } from "../../ports/recovery/types";
import type { RecoveryOperations } from "./types";
/**
 * Блокирует восстановление из поколения явного logout и удаляет выбранный intent и временный
 * payload.
 */
export const explicitLogout = (
  {
    state,
    payload,
    discardAll,
  }: Pick<RecoveryOperations, "state" | "payload" | "discardAll">,
  identity: RecoveryIdentity,
) => {
  state.blockedGeneration =
    identity.actor?.generation ?? payload.suspended?.actor.generation;
  discardAll();
};
