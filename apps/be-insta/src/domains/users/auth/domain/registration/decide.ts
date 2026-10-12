import { Result } from "@bloodyowl/boxed";
import { RegistrationErrorCode } from "@insta/contracts/errors";
import { durations } from "../../../domain/conts";
import { otpPolicy } from "./conts";
import type { Challenge, RegistrationError } from "./types";
/**
 * Решает, можно ли выдать новый OTP: живой challenge сохраняет deadline и ошибки,
 * cooldown/exhaustion отказывают; истёкший начинает новое окно.
 */
export const decideRequest = ({
  previous,
  now,
}: Readonly<{ previous: Challenge | null; now: number }>): Result<
  Readonly<{ registrationExpiresAt: number; errors: number }>,
  RegistrationError
> => {
  if (!previous || previous.registrationExpiresAt <= now)
    return Result.Ok({
      registrationExpiresAt: now + durations.registrationMs,
      errors: 0,
    });
  if (previous.errors >= otpPolicy.errors)
    return Result.Error(RegistrationErrorCode.CodeExhausted);
  if (previous.nextSendAt > now)
    return Result.Error(RegistrationErrorCode.ResendCooldown);
  return Result.Ok({
    registrationExpiresAt: previous.registrationExpiresAt,
    errors: previous.errors,
  });
};
/**
 * Разрешает потребление только живого, не исчерпанного и ещё не использованного challenge
 * с совпавшим кодом; состояние не изменяет.
 */
export const decideVerification = ({
  challenge,
  now,
  matches,
}: Readonly<{ challenge: Challenge; now: number; matches: boolean }>): Result<
  "consume",
  RegistrationError
> => {
  if (challenge.registrationExpiresAt <= now)
    return Result.Error(RegistrationErrorCode.RegistrationExpired);
  if (challenge.errors >= otpPolicy.errors)
    return Result.Error(RegistrationErrorCode.CodeExhausted);
  if (challenge.consumed || !matches)
    return Result.Error(RegistrationErrorCode.CodeInvalid);
  return Result.Ok("consume");
};
