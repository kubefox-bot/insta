import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import type { SessionDependencies } from "../ports/dependencies";
import type { Binding, SessionCredentials, SessionError } from "../types";
/** Проверяет сроки credentials, шифрует токены и revoke secret разными операциями порта и сохраняет новую привязку с TTL. Невалидные сроки дают SESSION_REQUIRED, исключения шифрования или записи — SESSION_UNAVAILABLE; подтверждения отсутствия записи при ошибке нет. */
export const createBinding = async (
  credentials: SessionCredentials,
  dependencies: SessionDependencies,
): Promise<Result<Binding, SessionError>> => {
  const { clock, crypto, id, store } = dependencies;
  if (
    credentials.expiresAt <= clock() ||
    credentials.expiresAt > credentials.absoluteExpiresAt ||
    credentials.accessExpiresAt > credentials.expiresAt
  )
    return Result.Error(SessionErrorCode.SessionRequired);
  try {
    const binding: Binding = {
      bindingId: id(),
      user: { ...credentials.user },
      backendSessionId: credentials.backendSessionId,
      credentials: await crypto.sealCredentials({
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
      }),
      revokeSecret: await crypto.sealRevokeSecret(credentials.revokeSecret),
      accessExpiresAt: credentials.accessExpiresAt,
      expiresAt: credentials.expiresAt,
      absoluteExpiresAt: credentials.absoluteExpiresAt,
      revision: 0,
      blocked: false,
      cleanupAt: new Date(credentials.absoluteExpiresAt),
    };
    await store.create(binding);
    return Result.Ok(binding);
  } catch {
    return Result.Error(SessionErrorCode.SessionUnavailable);
  }
};
