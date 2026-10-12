import { Result } from "@bloodyowl/boxed";
import { sessionIdentity, sessionValidity } from "../domain/session-validity";
import type { Actor, AuthError } from "../domain/types";
import type { AuthDependencies } from "../ports/dependencies";
/**
 * Проверяет access token, затем владельца, состояние и сроки канонической сессии;
 * username берёт из текущего пользователя, а не из JWT.
 */
export const authorizeSession = async (
  { accessToken }: Readonly<{ accessToken: string }>,
  {
    sessions,
    tokens,
    clock,
  }: Pick<AuthDependencies, "sessions" | "tokens" | "clock">,
): Promise<Result<Actor, AuthError>> => {
  const verified = await tokens.verifyAccess({ accessToken, now: clock() });
  if (verified.isError()) return Result.Error(verified.getError());
  const claims = verified.get();
  const current = await sessions.read(claims.backendSessionId);
  const identity = sessionIdentity({ current, userId: claims.userId });
  if (identity.isError()) return Result.Error(identity.getError());
  const now = clock();
  const validity = sessionValidity({
    current: identity.get(),
    accessExpiresAt: claims.accessExpiresAt,
    now,
  });
  if (validity.isError()) return Result.Error(validity.getError());
  return Result.Ok({ ...claims, username: validity.get().user.username });
};
