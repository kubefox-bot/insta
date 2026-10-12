import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import type { SessionDependencies } from "../../ports/dependencies";
import type { Binding, SessionError } from "../../types";
import { refreshBinding } from "../refresh";
/** Отсекает отсутствующую или заблокированную привязку и смену ожидаемого пользователя. При сохранённой refresh-попытке ждёт её восстановления, затем проверяет оба срока; чтение не инициирует ротацию только из-за accessExpiresAt. */
export const readAuthorizedBinding = async (
  {
    bindingId,
    expectedUserId,
  }: Readonly<{ bindingId: string; expectedUserId?: string }>,
  dependencies: SessionDependencies,
): Promise<Result<Binding, SessionError>> => {
  const initial = await dependencies.store.read(bindingId);
  if (!initial || initial.blocked)
    return Result.Error(SessionErrorCode.SessionRequired);
  if (expectedUserId && initial.user.id !== expectedUserId)
    return Result.Error(SessionErrorCode.ActorChanged);
  const current: Result<Binding, SessionError> = initial.attempt
    ? await refreshBinding(
        { bindingId, revision: initial.revision },
        dependencies,
      )
    : Result.Ok(initial);
  if (current.isError()) return current;
  const binding = current.get();
  if (
    Math.min(binding.expiresAt, binding.absoluteExpiresAt) <=
    dependencies.clock()
  )
    return Result.Error(SessionErrorCode.SessionRequired);
  return current;
};
