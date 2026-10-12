import { CommonErrorCode } from "@insta/contracts/errors";
import { acceptsCookieMutation } from "../../../../lib/http/server/index";
import {
  decryptSessionCookie,
  sessionCookieName,
} from "../../../../lib/session/server/cookies";
import { logout, resolveActor } from "../../../../lib/session/server/lifecycle";
import { methodNotAllowedStatus } from "../conts";
import type { AuthRequest, AuthTransportDependencies } from "../types";
import { authFailure, authReply } from "./reply";
/**
 * Читает actor для GET/HEAD либо запускает logout для POST после проверки origin; остальные
 * методы отклоняет, результат отзыва передаёт без утверждения его немедленного завершения.
 */
export const sessionRequest = async (
  { request, origin, cookies }: AuthRequest,
  dependencies: AuthTransportDependencies,
) => {
  const { cookieKey, sessions, context } = dependencies;
  const bindingId = await decryptSessionCookie({
    cookie: cookies.get(sessionCookieName),
    key: cookieKey,
    now: sessions.clock(),
  });
  switch (request.method) {
    case "GET":
    case "HEAD": {
      const result = await resolveActor({ bindingId }, sessions);
      return result.isOk()
        ? authReply(result.get(), context)
        : authFailure(result.getError(), context);
    }
    case "POST": {
      if (!acceptsCookieMutation({ request, origin }))
        return authFailure(CommonErrorCode.Forbidden, context);
      const result = await logout({ bindingId }, sessions);
      return result.isOk()
        ? authReply(result.get(), context)
        : authFailure(result.getError(), context);
    }
    default:
      return new Response(null, { status: methodNotAllowedStatus });
  }
};
