import { Result } from "@bloodyowl/boxed";
import { RegistrationErrorCode } from "@insta/contracts/errors";
import { validPassword, validUsername } from "../../domain/policy";
import { sessionCredentialsSchema } from "../domain/credentials";
import { activationErrors } from "../domain/registration/conts";
import type { RegistrationError } from "../domain/registration/types";
import type { SessionCredentials } from "../domain/types";
import { prepareSession } from "../lib/prepare-session";
import type { RegistrationDependencies } from "../ports/registration/dependencies";
/**
 * Проверяет proof и credentials, хеширует пароль и атомарно активирует сессию; при
 * idempotent replay расшифровывает сохранённые credentials и возвращает исходный
 * operationId.
 */
export const completeRegistration = async (
  input: Readonly<{
    proof: string;
    username: string;
    password: string;
    idempotencyKey?: string;
    operationId: string;
  }>,
  dependencies: RegistrationDependencies,
): Promise<
  Result<
    Readonly<{ credentials: SessionCredentials; operationId: string }>,
    RegistrationError
  >
> => {
  const { crypto, persistence, auth } = dependencies;
  if (!validUsername(input.username) || !validPassword(input.password))
    return Result.Error(RegistrationErrorCode.RegistrationConflict);
  const verified = await crypto.verifyProof({
    proof: input.proof,
    now: auth.clock(),
  });
  if (verified.isError()) return Result.Error(verified.getError());
  const proof = verified.get();
  const passwordHash = await auth.passwords.hash({ password: input.password });
  const { credentials, now, session } = await prepareSession({
    user: { id: proof.userId, username: input.username },
    auth,
  });
  if (proof.expiresAt <= now)
    return Result.Error(RegistrationErrorCode.RegistrationExpired);
  const replay = input.idempotencyKey
    ? {
        keyDigest: crypto.digest(JSON.stringify(["key", input.idempotencyKey])),
        fingerprint: crypto.digest(
          JSON.stringify([
            "complete",
            proof.userId,
            proof.secret,
            input.username,
            input.password,
          ]),
        ),
        ciphertext: await auth.tokens.seal({
          value: JSON.stringify(credentials),
        }),
      }
    : undefined;
  const result = await persistence.activateAndIssueSession({
    userId: proof.userId,
    tokenDigest: crypto.digest(proof.secret),
    username: input.username,
    passwordHash,
    now,
    operationId: input.operationId,
    session,
    ...(replay ? { replay } : {}),
  });
  if (result.isError())
    return Result.Error(activationErrors[result.getError()]);
  const committed = result.get();
  if (committed.state === "replayed")
    return Result.Ok({
      credentials: sessionCredentialsSchema.parse(
        JSON.parse(
          await auth.tokens.open({ ciphertext: committed.ciphertext }),
        ),
      ),
      operationId: committed.operationId,
    });
  return Result.Ok({ credentials, operationId: input.operationId });
};
