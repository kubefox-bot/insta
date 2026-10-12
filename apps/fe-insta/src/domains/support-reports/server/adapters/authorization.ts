import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode, SupportErrorCode } from "@insta/contracts/errors";
import type { RequestContext } from "../../../../lib/api/server/index";
import {
  decryptSessionCookie,
  executeAuthorized,
  type SessionDependencies,
  sessionCookieName,
} from "../../../../lib/session/server/index";
import { supportFailure } from "../reply";
import type { SupportServerDependencies } from "../types";

/**
 * Создаёт отправку с проверкой привязки session cookie к ожидаемому автору; запрещает
 * автоматический replay и отображает отказ авторизации как недоступность identity.
 */
export const createSupportAuthorization =
  ({
    sessions,
    key,
    context,
  }: Readonly<{
    sessions: () => Promise<SessionDependencies>;
    key: Uint8Array;
    context: RequestContext;
  }>): SupportServerDependencies["authorized"] =>
  async ({ request, userId, send }) => {
    const dependencies = await sessions();
    const bindingId = await decryptSessionCookie({
      cookie: request.cookies.get(sessionCookieName),
      key,
      now: dependencies.clock(),
    });
    if (!bindingId)
      return supportFailure(SessionErrorCode.ActorChanged, context);
    const result = await executeAuthorized(
      {
        bindingId,
        expectedUserId: userId,
        replay: "never",
        /**
         * Передаёт токен однократной отправке и оборачивает её HTTP-ответ в Result;
         * транспортное исключение остаётся ошибкой исполнения.
         */
        request: async (token) => Result.Ok(await send(token)),
      },
      dependencies,
    );
    return result.isOk()
      ? result.get()
      : supportFailure(SupportErrorCode.SupportIdentityUnavailable, context);
  };
