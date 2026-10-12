import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode, SessionErrorCode } from "@insta/contracts/errors";

import { acceptsRefreshCredentials } from "../../domain/credentials";
import type { SessionDependencies } from "../../ports/dependencies";
import type { Binding, SessionError } from "../../types";
import { currentBinding } from "./current-binding";
/** Использует сохранённые credentials и ключ попытки для backend refresh, фиксируя исход с revision и lease-generation fence. Отзыв блокирует привязку; неприемлемые credentials и неопределённые ошибки сохраняют unknown для восстановления. После фиксации перечитывает состояние, а ошибки портов пробрасывает. */
export const completeRefresh = async (
  binding: Binding,
  dependencies: SessionDependencies,
): Promise<Result<Binding, SessionError>> => {
  const { store, backend, crypto, clock } = dependencies;
  const attempt = binding.attempt;
  if (!attempt) return Result.Error(SessionErrorCode.SessionUnavailable);
  const original = await crypto.openCredentials(attempt.credentials);
  const response = await backend.refresh({
    refreshToken: original.refreshToken,
    key: attempt.key,
  });
  const fence = {
    bindingId: binding.bindingId,
    revision: binding.revision,
    key: attempt.key,
    leaseGeneration: attempt.leaseGeneration,
  };
  if (
    response.isError() &&
    response.getError().code === AuthErrorCode.SessionRevoked
  ) {
    await store.block({
      bindingId: binding.bindingId,
      backendSessionId: binding.backendSessionId,
    });
    return Result.Error(SessionErrorCode.SessionRequired);
  }
  if (response.isOk()) {
    const credentials = response.get();
    if (!acceptsRefreshCredentials({ binding, credentials, now: clock() })) {
      await store.finishRefresh({
        ...fence,
        now: clock(),
        outcome: { kind: "unknown" },
      });
      return Result.Error(SessionErrorCode.SessionUnavailable);
    }
    const encrypted = await crypto.sealCredentials({
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
    });
    await store.finishRefresh({
      ...fence,
      now: clock(),
      outcome: {
        kind: "success",
        credentials: encrypted,

        expiresAt: credentials.expiresAt,
        accessExpiresAt: credentials.accessExpiresAt,
      },
    });
  } else {
    const code = response.getError().code;
    const rejected =
      code === AuthErrorCode.RefreshTokenInvalid ||
      code === AuthErrorCode.RefreshTokenExpired;
    await store.finishRefresh({
      ...fence,
      now: clock(),
      outcome: { kind: rejected ? "rejected" : "unknown" },
    });
  }
  return currentBinding(
    { bindingId: binding.bindingId, previousRevision: binding.revision },
    dependencies,
  );
};
