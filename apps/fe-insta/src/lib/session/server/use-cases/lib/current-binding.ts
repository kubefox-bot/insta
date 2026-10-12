import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import type { SessionDependencies } from "../../ports/dependencies";
import type { Binding, SessionError } from "../../types";
/** Просит store заблокировать истёкшую старую revision и перечитывает итог конкурирующей ротации. Только новая revision без активной попытки считается готовой; блокировка даёт SESSION_REQUIRED, незавершённость — SESSION_UNAVAILABLE. */
export const currentBinding = async (
  {
    bindingId,
    previousRevision,
  }: Readonly<{ bindingId: string; previousRevision: number }>,
  { store, clock }: SessionDependencies,
): Promise<Result<Binding, SessionError>> => {
  await store.expire({ bindingId, revision: previousRevision, now: clock() });
  const current = await store.read(bindingId);
  if (!current || current.blocked)
    return Result.Error(SessionErrorCode.SessionRequired);
  if (current.attempt || current.revision <= previousRevision)
    return Result.Error(SessionErrorCode.SessionUnavailable);
  return Result.Ok(current);
};
