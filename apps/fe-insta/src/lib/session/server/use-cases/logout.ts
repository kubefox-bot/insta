import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import type { SessionDependencies } from "../ports/dependencies";
import type { Binding, SessionError } from "../types";
import { retryRevocation } from "./retry-revocation";
/** Сначала сохраняет блокировку и устойчивую задачу отзыва, затем пытается подтвердить backend revoke. Ошибка начальной записи даёт SESSION_UNAVAILABLE, отсутствие привязки — SESSION_REQUIRED; неопределённый результат отзыва возвращается как pending для последующих попыток. */
export const logout = async (
  { bindingId }: Readonly<{ bindingId?: string }>,
  dependencies: SessionDependencies,
): Promise<
  Result<Readonly<{ revocation: "confirmed" | "pending" }>, SessionError>
> => {
  if (!bindingId) return Result.Error(SessionErrorCode.SessionRequired);
  const saved: Result<Binding | null, SessionError> = await dependencies.store
    .beginRevocation({
      bindingId,
      key: dependencies.id(),
      now: dependencies.clock(),
    })
    .then(
      (value) => Result.Ok(value),
      () => Result.Error(SessionErrorCode.SessionUnavailable),
    );
  if (saved.isError()) return Result.Error(saved.getError());
  const binding = saved.get();
  if (!binding) return Result.Error(SessionErrorCode.SessionRequired);
  try {
    return Result.Ok({
      revocation: await retryRevocation(binding, dependencies),
    });
  } catch {
    return Result.Ok({ revocation: "pending" });
  }
};
