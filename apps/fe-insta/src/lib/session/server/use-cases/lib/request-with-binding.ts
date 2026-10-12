import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import type { SessionDependencies } from "../../ports/dependencies";
import type { BackendError, Binding } from "../../types";
/** Расшифровывает access token только для переданного запроса. SESSION_REVOKED сохраняет блокировку именно этой backend-сессии; остальные результаты возвращает без повторов, ошибки crypto/store остаются у вызывающего сценария. */
export const requestWithBinding = async <Value>(
  {
    binding,
    request,
  }: Readonly<{
    binding: Binding;
    request: (token: string) => Promise<Result<Value, BackendError>>;
  }>,
  { crypto, store }: SessionDependencies,
): Promise<Result<Value, BackendError>> => {
  const result = await request(
    (await crypto.openCredentials(binding.credentials)).accessToken,
  );
  if (
    result.isError() &&
    result.getError().code === AuthErrorCode.SessionRevoked
  ) {
    await store.block({
      bindingId: binding.bindingId,
      backendSessionId: binding.backendSessionId,
    });
    return Result.Error({ code: AuthErrorCode.SessionRevoked });
  }
  return result;
};
