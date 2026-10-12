import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";
import { readBearerToken } from "../../../../../lib/http/index";

import type { AuthDependencies } from "../../ports/dependencies";
import { authorizeSession } from "../../use-cases/authorize-session";

/**
 * Извлекает bearer из HTTP-заголовков; отсутствие токена возвращает ожидаемый отказ,
 * имеющийся токен проверяет через сценарий canonical session.
 */
export const authorizeBearer = (
  headers: Readonly<Record<string, unknown>>,
  dependencies: AuthDependencies,
) => {
  const accessToken = readBearerToken({ authorization: headers.authorization });
  if (!accessToken)
    return Promise.resolve(
      Result.Error(AuthErrorCode.AccessTokenInvalid as const),
    );
  return authorizeSession({ accessToken }, dependencies);
};
