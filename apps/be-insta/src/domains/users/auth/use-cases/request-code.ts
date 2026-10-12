import { Result } from "@bloodyowl/boxed";
import { emailKey } from "../../domain/policy";
import { otpPolicy } from "../domain/registration/conts";
import { decideRequest } from "../domain/registration/decide";
import type { RegistrationError } from "../domain/registration/types";
import type { RegistrationDependencies } from "../ports/registration/dependencies";
/**
 * Нормализует email и ставит новую версию OTP с зашифрованным письмом; живой deadline
 * ограничивает канонической регистрацией и не сбрасывает счётчик ошибок.
 */
export const requestCode = async (
  input: Readonly<{ email: string; operationId: string }>,
  dependencies: RegistrationDependencies,
): Promise<
  Result<
    Readonly<{ challengeId: string; registrationExpiresAt: number }>,
    RegistrationError
  >
> => {
  const { challenges, crypto, auth } = dependencies;
  const email = emailKey(input.email);
  const challengeId = crypto.challengeId(email);
  const previous = await challenges.read(challengeId);
  const now = auth.clock();
  const decision = decideRequest({ previous, now });
  if (decision.isError()) return Result.Error(decision.getError());
  const canonicalDeadline = await dependencies.registration.deadline({
    email,
    now,
  });
  const registrationExpiresAt = Math.min(
    decision.get().registrationExpiresAt,
    canonicalDeadline ?? decision.get().registrationExpiresAt,
  );
  const version = crypto.secret();
  const code = crypto.code();
  const result = await challenges.enqueue({
    expected: previous,
    now,
    operationId: input.operationId,
    mailPayload: await crypto.sealMail({ email, code }),
    challenge: {
      challengeId,
      ...decision.get(),
      registrationExpiresAt,
      nextSendAt: now + otpPolicy.resendCooldownMs,
      version,
      consumed: false,
      revision: (previous?.revision ?? 0) + 1,
      codeDigest: crypto.codeDigest({ challengeId, version, code }),
      ciphertext: await crypto.sealMail({ email, code: "" }),
    },
  });
  if (result.isError()) return Result.Error(result.getError());
  return Result.Ok({
    challengeId,
    registrationExpiresAt: result.get().registrationExpiresAt,
  });
};
