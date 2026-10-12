import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import type { SessionId } from "../../domain/types";
import {
  refreshCredentialsSchema,
  refreshProofSchema,
} from "../domain/credentials";
import { sessionExpiry } from "../domain/session";
import type { AuthError, RefreshCredentials } from "../domain/types";
import type { AuthDependencies } from "../ports/dependencies";
/**
 * Готовит новые токены вне повторяемой транзакции и передаёт атомарную проверку refresh
 * адаптеру; возвращает расшифрованный committed/replayed результат, а не локальную
 * заготовку.
 */
export const refresh = async (
  input: Readonly<{
    refreshToken: string;
    idempotencyKey?: string;
    operationId: string;
  }>,
  { sessions, tokens, clock }: AuthDependencies,
): Promise<
  Result<
    Readonly<{ credentials: RefreshCredentials; operationId: string }>,
    AuthError
  >
> => {
  if (!refreshProofSchema.safeParse(input.refreshToken).success)
    return Result.Error(AuthErrorCode.RefreshTokenInvalid as const);
  const backendSessionId = input.refreshToken.split(".")[0] as SessionId;
  const current = await sessions.read(backendSessionId);
  if (!current) return Result.Error(AuthErrorCode.RefreshTokenInvalid as const);
  const now = clock();
  const expiry = sessionExpiry({
    now,
    absoluteExpiresAt: current.absoluteExpiresAt,
  });
  // Preparation is outside the retried transaction. The adapter checks proof and fresh state atomically.
  const credentials = {
    user: current.user,
    backendSessionId,
    refreshToken: `${backendSessionId}.${tokens.secret()}`,
    absoluteExpiresAt: current.absoluteExpiresAt,
    ...expiry,
    accessToken: await tokens.issueAccess({
      userId: current.user.id,
      backendSessionId,
      now,
      accessExpiresAt: expiry.accessExpiresAt,
    }),
  };
  const result = await sessions.rotate({
    backendSessionId,
    userId: current.user.id,
    generation: current.generation,
    previousDigest: tokens.digest({ secret: input.refreshToken }),
    nextDigest: tokens.digest({ secret: credentials.refreshToken }),
    keyDigest: tokens.digest({
      secret: input.idempotencyKey ?? tokens.secret(),
    }),
    fingerprint: tokens.digest({ secret: input.refreshToken }),
    ciphertext: await tokens.seal({ value: JSON.stringify(credentials) }),
    ...expiry,
    operationId: input.operationId,
  });
  if (result.isError()) return Result.Error(result.getError());
  return Result.Ok({
    credentials: refreshCredentialsSchema.parse(
      JSON.parse(await tokens.open({ ciphertext: result.get().ciphertext })),
    ),
    operationId: result.get().operationId,
  });
};
