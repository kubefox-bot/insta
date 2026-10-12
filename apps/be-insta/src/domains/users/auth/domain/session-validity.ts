import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import type { UserId } from "../../domain/types";
import type { AuthError, AuthSession } from "./types";

/**
 * Проверяет принадлежность канонической сессии пользователю и отличает revoked от
 * отсутствующего/чужого session; сроки здесь не проверяются.
 */
export const sessionIdentity = ({
  current,
  userId,
}: Readonly<{
  current: AuthSession | null;
  userId: UserId;
}>): Result<AuthSession, AuthError> => {
  if (!current || current.user.id !== userId)
    return Result.Error(AuthErrorCode.AccessTokenInvalid as const);
  if (current.state === "revoked")
    return Result.Error(AuthErrorCode.SessionRevoked as const);
  return Result.Ok(current);
};

/**
 * Проверяет активность и сроки сессии перед сроком access, сохраняя различие
 * RefreshTokenExpired и AccessTokenExpired.
 */
export const sessionValidity = ({
  current,
  accessExpiresAt,
  now,
}: Readonly<{
  current: AuthSession;
  accessExpiresAt: number;
  now: number;
}>): Result<AuthSession, AuthError> => {
  if (
    current.state !== "active" ||
    current.expiresAt <= now ||
    current.absoluteExpiresAt <= now
  )
    return Result.Error(AuthErrorCode.RefreshTokenExpired as const);
  if (accessExpiresAt <= now)
    return Result.Error(AuthErrorCode.AccessTokenExpired as const);
  return Result.Ok(current);
};
