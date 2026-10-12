import { Result } from "@bloodyowl/boxed";
import { RegistrationErrorCode } from "@insta/contracts/errors";
import { decideVerification } from "../domain/registration/decide";
import type { RegistrationError } from "../domain/registration/types";
import type { RegistrationDependencies } from "../ports/registration/dependencies";
/**
 * Потребляет OTP с учётом конкурентной версии, затем подтверждает email и выдаёт proof
 * либо login_required; сбой после потребления требует ReconfirmEmail.
 */
export const verifyCode = async (
  input: Readonly<{ challengeId: string; code: string }>,
  dependencies: RegistrationDependencies,
): Promise<
  Result<
    | Readonly<{ status: "login_required" }>
    | Readonly<{
        status: "pending_setup";
        registrationProof: string;
        expiresAt: number;
      }>,
    RegistrationError
  >
> => {
  const { challenges, crypto, registration, auth } = dependencies;
  const challenge = await challenges.read(input.challengeId);
  if (!challenge) return Result.Error(RegistrationErrorCode.CodeInvalid);
  const now = auth.clock();
  const matches =
    crypto.codeDigest({ ...input, version: challenge.version }) ===
    challenge.codeDigest;
  const decision = decideVerification({ challenge, now, matches });
  if (
    decision.isError() &&
    decision.getError() !== RegistrationErrorCode.CodeInvalid
  )
    return Result.Error(decision.getError());
  const consumed = await challenges.verify({
    expected: challenge,
    matches,
    now,
  });
  if (consumed.isError()) return Result.Error(consumed.getError());
  try {
    const mail = await crypto.openMail(consumed.get());
    const secret = crypto.secret();
    const pending = await registration.confirmEmail({
      email: mail.email,
      tokenDigest: crypto.digest(secret),
      registrationExpiresAt: challenge.registrationExpiresAt,
      now: auth.clock(),
    });
    if (pending.isError())
      return Result.Error(RegistrationErrorCode.ReconfirmEmail);
    const user = pending.get();
    if (user.status === "active")
      return Result.Ok({ status: "login_required" });
    const registrationProof = await crypto.issueProof({
      userId: user.id,
      secret,
      now: auth.clock(),
      expiresAt: user.registrationExpiresAt,
    });
    return Result.Ok({
      status: "pending_setup",
      registrationProof,
      expiresAt: user.registrationExpiresAt,
    });
  } catch {
    return Result.Error(RegistrationErrorCode.ReconfirmEmail);
  }
};
