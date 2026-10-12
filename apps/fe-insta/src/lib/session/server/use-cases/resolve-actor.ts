import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode, SessionErrorCode } from "@insta/contracts/errors";

import type { SessionDependencies } from "../ports/dependencies";
import type { Binding, SessionError, WebActor } from "../types";
import { executeAuthorized } from "./execute-authorized";
/** Подтверждает identity через backend authorize и повторно читает привязку, исключая блокировку и другого пользователя. Generation берётся из сохранённой backend-сессии; отзыв превращается в SESSION_REQUIRED, недоступность backend или store — в SESSION_UNAVAILABLE. */
export const resolveActor = async (
  { bindingId }: Readonly<{ bindingId?: string }>,
  dependencies: SessionDependencies,
): Promise<Result<WebActor, SessionError>> => {
  if (!bindingId) return Result.Error(SessionErrorCode.SessionRequired);
  const result = await executeAuthorized(
    { bindingId, request: dependencies.backend.authorize },
    dependencies,
  );
  if (result.isError()) {
    const error = result.getError();
    if (
      typeof error !== "string" &&
      error.code === AuthErrorCode.SessionRevoked
    )
      return Result.Error(SessionErrorCode.SessionRequired);
    return Result.Error(
      typeof error === "string" ? error : SessionErrorCode.SessionUnavailable,
    );
  }
  const actor = result.get();
  const stored: Result<Binding | null, SessionError> = await dependencies.store
    .read(bindingId)
    .then(
      (value) => Result.Ok(value),
      () => Result.Error(SessionErrorCode.SessionUnavailable),
    );
  if (stored.isError()) return Result.Error(stored.getError());
  const binding = stored.get();
  if (!binding || binding.blocked || binding.user.id !== actor.userId)
    return Result.Error(SessionErrorCode.SessionRequired);
  return Result.Ok({
    userId: actor.userId,
    username: actor.username,
    generation: binding.backendSessionId,
  });
};
