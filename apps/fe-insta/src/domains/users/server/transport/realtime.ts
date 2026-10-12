import { CommonErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import { acceptsCookieMutation } from "../../../../lib/http/server/index";
import {
  decryptSessionCookie,
  executeAuthorized,
  sessionCookieName,
} from "../../../../lib/session/server/index";
import type { createTicketBackend } from "../adapters/ws-ticket";
import type { AuthRequest, AuthTransportDependencies } from "../types";
import { authFailure, authReply } from "./reply";
/**
 * Проверяет origin и session cookie перед выдачей websocket-ticket через авторизованный
 * запрос; возвращает публичную квитанцию либо ошибку сессии.
 */
export const ticketRequest = async (
  { request, origin, cookies }: AuthRequest,
  {
    sessions,
    context,
    cookieKey,
    backend,
  }: Pick<AuthTransportDependencies, "sessions" | "context" | "cookieKey"> &
    Readonly<{ backend: ReturnType<typeof createTicketBackend> }>,
) => {
  if (!acceptsCookieMutation({ request, origin }))
    return authFailure(CommonErrorCode.Forbidden, context);
  const bindingId = await decryptSessionCookie({
    cookie: cookies.get(sessionCookieName),
    key: cookieKey,
    now: sessions.clock(),
  });
  if (!bindingId) return authFailure(SessionErrorCode.SessionRequired, context);
  const result = await executeAuthorized(
    { bindingId, request: backend },
    sessions,
  );
  if (result.isError()) {
    const error = result.getError();
    return authFailure(typeof error === "string" ? error : error.code, context);
  }
  return authReply(result.get(), context);
};
