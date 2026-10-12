import { authStatus } from "../conts";
import type { AuthTransportDependencies } from "../types";
/**
 * Оборачивает публичные данные auth в некешируемый успешный ответ с контекстом запроса.
 */
export const authReply = (
  data: unknown,
  context: AuthTransportDependencies["context"],
) =>
  Response.json(
    { ok: true, data, meta: context },
    { headers: { "Cache-Control": "no-store" } },
  );
/**
 * Публикует auth-ошибку с известным статусом; неизвестный код получает статус недоступной
 * сессии, сохраняя сам код.
 */
export const authFailure = (
  code: string,
  context: AuthTransportDependencies["context"],
) =>
  Response.json(
    { ok: false, error: { code, message: code }, meta: context },
    {
      status: Object.hasOwn(authStatus, code)
        ? authStatus[code as keyof typeof authStatus]
        : authStatus.SESSION_UNAVAILABLE,
      headers: { "Cache-Control": "no-store" },
    },
  );
