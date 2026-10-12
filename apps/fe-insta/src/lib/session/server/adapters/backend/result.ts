import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import type { ApiFailure } from "../../../../api/server/index";
import { serverErrorStatus } from "../../../../http/server/index";
import type { BackendError } from "../../types";
/** Сохраняет успешный результат и клиентские API-ошибки, но transport/contract failures и любые HTTP 5xx переводит в SESSION_UNAVAILABLE. Даже auth-shaped тело серверной ошибки не доказывает окончательный отказ операции. */
export const mapBackendResult = <Value>(
  result: Result<Value, ApiFailure<BackendError>>,
): Result<Value, BackendError> => {
  if (result.isOk()) return Result.Ok(result.get());
  const error = result.getError();
  // A server failure is an unknown outcome even if it carries an auth-shaped body.
  if (error.kind !== "api" || error.status >= serverErrorStatus)
    return Result.Error({ code: SessionErrorCode.SessionUnavailable });
  return Result.Error(error.error);
};
