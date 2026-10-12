import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode, SessionErrorCode } from "@insta/contracts/errors";

import type { SessionDependencies } from "../ports/dependencies";
import type { BackendError, SessionError } from "../types";
import { readAuthorizedBinding } from "./lib/read-authorized-binding";
import { requestWithBinding } from "./lib/request-with-binding";
import { refreshBinding } from "./refresh";
/** Выполняет запрос с проверенной привязкой; только ACCESS_TOKEN_EXPIRED и разрешённый replay допускают одну ротацию и повтор. Перед повтором перечитывает identity и блокировку для защиты от logout; отклонения зависимостей, включая последний replay, превращаются в SESSION_UNAVAILABLE. */
export const executeAuthorized = async <Value>(
  {
    bindingId,
    expectedUserId,
    replay = "once",
    request,
  }: Readonly<{
    bindingId: string;
    expectedUserId?: string;
    replay?: "once" | "never";
    request: (accessToken: string) => Promise<Result<Value, BackendError>>;
  }>,
  dependencies: SessionDependencies,
): Promise<Result<Value, SessionError | BackendError>> => {
  try {
    const current = await readAuthorizedBinding(
      { bindingId, expectedUserId },
      dependencies,
    );
    if (current.isError()) return Result.Error(current.getError());
    const binding = current.get();
    const response = await requestWithBinding(
      { binding, request },
      dependencies,
    );
    if (response.isOk()) return response;
    if (
      response.getError().code !== AuthErrorCode.AccessTokenExpired ||
      replay === "never"
    )
      return response;
    const refreshed = await refreshBinding(
      { bindingId, revision: binding.revision },
      dependencies,
    );
    if (refreshed.isError()) return Result.Error(refreshed.getError());
    // Identity is immutable during refresh; re-reading also fences concurrent logout before replay.
    const active = await readAuthorizedBinding(
      { bindingId, expectedUserId },
      dependencies,
    );
    if (active.isError()) return Result.Error(active.getError());
    return await requestWithBinding(
      { binding: active.get(), request },
      dependencies,
    );
  } catch {
    return Result.Error(SessionErrorCode.SessionUnavailable);
  }
};
