import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import { durations } from "../../domain/conts";
import type {
  AuthError,
  RotationDecision,
  RotationInput,
  RotationState,
} from "./types";
/**
 * Выбирает rotate/replay/revoke по digest и истории refresh, проверяя активность, сроки и
 * поколение; само решение не изменяет сессию.
 */
export const decideRotation = ({
  current,
  input,
  now,
}: Readonly<{
  current: RotationState;
  input: RotationInput;
  now: number;
}>): Result<RotationDecision, AuthError> => {
  const previous = current.previousRefresh.find(
    (value) => value.digest === input.previousDigest,
  );
  if (current.refreshDigest !== input.previousDigest && !previous)
    return Result.Error(AuthErrorCode.RefreshTokenInvalid as const);
  if (current.state === "revoked")
    return Result.Error(AuthErrorCode.SessionRevoked as const);
  if (
    current.state !== "active" ||
    current.expiresAt <= now ||
    current.absoluteExpiresAt <= now
  )
    return Result.Error(AuthErrorCode.RefreshTokenExpired as const);
  if (previous) return Result.Ok(previousAttempt({ previous, input }));
  if (current.generation !== input.generation)
    return Result.Error(AuthErrorCode.AuthConflict as const);
  if (!validRotationExpiry({ current, input, now }))
    return Result.Error(AuthErrorCode.RefreshTokenExpired as const);
  return Result.Ok({ state: "rotate" });
};

/**
 * Проверяет положительный остаток access/refresh срока и ограничение нового refresh
 * абсолютным deadline и окном политики.
 */
const validRotationExpiry = ({
  current,
  input,
  now,
}: Readonly<{ current: RotationState; input: RotationInput; now: number }>) =>
  input.expiresAt > now &&
  input.accessExpiresAt > now &&
  input.expiresAt <=
    Math.min(now + durations.refreshMs, current.absoluteExpiresAt);

/**
 * Считает прежний digest допустимым replay только при совпадении key и fingerprint; иной
 * повтор требует отзыва сессии.
 */
const previousAttempt = ({
  previous,
  input,
}: Readonly<{
  previous: RotationState["previousRefresh"][number];
  input: RotationInput;
}>): RotationDecision =>
  previous.keyDigest !== input.keyDigest ||
  previous.fingerprint !== input.fingerprint
    ? { state: "revoke" }
    : { state: "replay" };
