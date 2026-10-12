import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import type { AuthError, RevocationProof, RevocationState } from "./types";
/**
 * Проверяет secret-доказательство до классификации состояния; различает новый
 * отзыв, повтор и истечение без изменения сессии.
 */
export const decideRevocation = ({
  current,
  proof,
  now,
}: Readonly<{
  current: RevocationState;
  proof: RevocationProof;
  now: number;
}>): Result<"revoke" | "revoked" | "expired", AuthError> => {
  if (current.revokeDigest !== proof.digest)
    return Result.Error(AuthErrorCode.RevokeProofInvalid as const);
  if (current.state === "revoked") return Result.Ok("revoked");
  if (
    current.state === "expired" ||
    current.expiresAt <= now ||
    current.absoluteExpiresAt <= now
  )
    return Result.Ok("expired");
  return Result.Ok("revoke");
};
