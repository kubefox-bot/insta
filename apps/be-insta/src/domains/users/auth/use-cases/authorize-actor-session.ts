import { Result } from "@bloodyowl/boxed";
import { sessionIdentity, sessionValidity } from "../domain/session-validity";
import type { Actor, AuthError } from "../domain/types";
import type { AuthDependencies } from "../ports/dependencies";
/**
 * Повторно сверяет actor с канонической сессией и сроками; передаёт сигнал чтению и
 * проверяет отмену до успешного возврата исходного actor.
 */
export const authorizeActorSession = async (
  { actor, signal }: Readonly<{ actor: Actor; signal?: AbortSignal }>,
  { sessions, clock }: Pick<AuthDependencies, "sessions" | "clock">,
): Promise<Result<Actor, AuthError>> => {
  signal?.throwIfAborted();
  const current = await sessions.read(actor.backendSessionId, signal);
  const now = clock();
  const identity = sessionIdentity({ current, userId: actor.userId });
  if (identity.isError()) return Result.Error(identity.getError());
  const validity = sessionValidity({
    current: identity.get(),
    accessExpiresAt: actor.accessExpiresAt,
    now,
  });
  if (validity.isError()) return Result.Error(validity.getError());
  signal?.throwIfAborted();
  return Result.Ok(actor);
};
