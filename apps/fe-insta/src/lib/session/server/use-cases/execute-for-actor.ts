import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { webSessionStatuses } from "../conts";
import type { SessionDependencies } from "../ports/dependencies";
import type { BackendError } from "../types";
import { executeAuthorized } from "./execute-authorized";
import { resolveActor } from "./resolve-actor";
/** Сверяет текущего backend actor с ожидаемыми userId и generation до авторизованного запроса. Несовпадение даёт ACTOR_CHANGED; session-ошибки получают HTTP-статус, из backend metadata сохраняются только requestId и operationId, а также доступный Retry-After. */
export const executeForActor = async <T>(
  {
    bindingId,
    actor,
    request,
    replay = "once",
  }: Readonly<{
    bindingId?: string;
    actor: Readonly<{ userId: string; generation: string }>;
    request: (
      accessToken: string,
    ) => Promise<Result<T, BackendError & Readonly<{ status: number }>>>;
    replay?: "once" | "never";
  }>,
  dependencies: SessionDependencies,
): Promise<Result<T, BackendError & Readonly<{ status: number }>>> => {
  const resolved = await resolveActor({ bindingId }, dependencies);
  if (resolved.isError())
    return Result.Error({
      code: resolved.getError(),
      status: webSessionStatuses[resolved.getError()],
    });
  if (
    !bindingId ||
    resolved.get().userId !== actor.userId ||
    resolved.get().generation !== actor.generation
  )
    return Result.Error({
      code: SessionErrorCode.ActorChanged,
      status: webSessionStatuses.ACTOR_CHANGED,
    });
  const result = await executeAuthorized(
    { bindingId, expectedUserId: actor.userId, request, replay },
    dependencies,
  );
  if (result.isOk()) return Result.Ok(result.get());
  const error = result.getError();
  if (typeof error === "string")
    return Result.Error({ code: error, status: webSessionStatuses[error] });
  return Result.Error({
    code: error.code,
    ...(error.meta
      ? {
          meta: {
            requestId: error.meta.requestId,
            operationId: error.meta.operationId,
          },
        }
      : {}),
    ...("retryAfter" in error && typeof error.retryAfter === "string"
      ? { retryAfter: error.retryAfter }
      : {}),
    status:
      "status" in error && typeof error.status === "number"
        ? error.status
        : webSessionStatuses.SESSION_UNAVAILABLE,
  });
};
