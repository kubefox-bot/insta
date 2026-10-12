import type { RecoveryIdentity } from "../../ports/recovery/types";
import type { RecoveryState } from "./types";
/**
 * Признаёт recovery identity недопустимой при pending logout либо несовпадении
 * пользователя/поколения с actor выбранных metadata.
 */
export const invalidIdentity = (
  { metadataActor }: RecoveryState,
  identity: RecoveryIdentity,
) =>
  identity.status === "pending" ||
  Boolean(
    identity.actor &&
      metadataActor &&
      (identity.actor.userId !== metadataActor.userId ||
        identity.actor.generation !== metadataActor.generation),
  );
