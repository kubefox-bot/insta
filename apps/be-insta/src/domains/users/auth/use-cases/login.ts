import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode } from "@insta/contracts/errors";

import { validPassword } from "../../domain/policy";
import type { AuthError, SessionCredentials } from "../domain/types";
import { prepareSession } from "../lib/prepare-session";
import type { AuthDependencies } from "../ports/dependencies";
/**
 * Проверяет пароль, включая вызов verify для отсутствующего аккаунта, затем готовит и
 * сохраняет новую сессию; credentials возвращает только после успешной выдачи.
 */
export const login = async (
  input: Readonly<{ email: string; password: string; operationId: string }>,
  dependencies: AuthDependencies,
): Promise<
  Result<
    Readonly<{ credentials: SessionCredentials; operationId: string }>,
    AuthError
  >
> => {
  const { sessions, passwords } = dependencies;
  if (!validPassword(input.password))
    return Result.Error(AuthErrorCode.InvalidCredentials as const);
  const account = await sessions.findAccount(input.email);
  const verified = await passwords.verify({
    password: input.password,
    hash: account?.passwordHash,
  });
  if (!account || !verified)
    return Result.Error(AuthErrorCode.InvalidCredentials as const);
  const prepared = await prepareSession({
    user: { id: account.id, username: account.username },
    auth: dependencies,
  });
  const result = await sessions.issue({
    userId: account.id,
    operationId: input.operationId,
    session: prepared.session,
  });
  if (result.isError()) return Result.Error(result.getError());
  return Result.Ok({
    credentials: prepared.credentials,
    operationId: result.get().operationId,
  });
};
