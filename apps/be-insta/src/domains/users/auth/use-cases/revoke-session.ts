import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import type { SessionId } from "../../domain/types";
import type { AuthDependencies } from "../ports/dependencies";
/**
 * Проверяет revoke secret по сохранённому digest до отзыва; новый operationId выделяет
 * порт, а входной idempotencyKey здесь не используется.
 */
export const revokeSession = async (
  input: Readonly<{
    backendSessionId: SessionId;
    revokeSecret: string;
    idempotencyKey?: string;
  }>,
  {
    sessions,
    tokens,
    operationId,
  }: Pick<AuthDependencies, "sessions" | "tokens" | "operationId">,
) => {
  const current = await sessions.read(input.backendSessionId);
  if (
    !current ||
    !tokens.matches({
      secret: input.revokeSecret,
      digest: current.revokeDigest,
    })
  )
    return Result.Error(AuthErrorCode.RevokeProofInvalid as const);
  return sessions.revoke({
    backendSessionId: input.backendSessionId,
    proof: { kind: "secret", digest: current.revokeDigest },
    operationId: operationId(),
  });
};
