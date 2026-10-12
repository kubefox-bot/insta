import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import type { Cookies } from "@sveltejs/kit";
import { z } from "zod";
import { acceptsCookieMutation } from "../../../../lib/http/server/index";
import { webSessionHeaders } from "../../../../lib/session/contracts/index";
import {
  decryptSessionCookie,
  executeForActor,
  sessionCookieName,
} from "../../../../lib/session/server/authorized";
import type { SessionDependencies } from "../../../../lib/session/server/index";
import { sendStatus } from "../conts";

const ownerSchema = z.object({
  userId: z.string().min(1),
  generation: z.string().min(1),
});
/** Проверяет origin мутации и ожидаемого владельца, расшифровывает cookie и делегирует вызов владельцу сессии. Только GET допускает один повтор после восстановления авторизации. */
export const authorizeConversation = async <T>(
  {
    request,
    cookies,
    origin,
    owner,
    execute,
  }: Readonly<{
    request: Request;
    cookies: Pick<Cookies, "get">;
    origin: string;
    owner?: z.infer<typeof ownerSchema>;
    execute: (
      accessToken: string,
    ) => Promise<Result<T, Readonly<{ code: string; status: number }>>>;
  }>,
  {
    sessions,
    cookieKey,
  }: Readonly<{ sessions: SessionDependencies; cookieKey: Uint8Array }>,
): Promise<Result<T, Readonly<{ code: string; status: number }>>> => {
  if (request.method !== "GET" && !acceptsCookieMutation({ request, origin }))
    return Result.Error({
      code: CommonErrorCode.Forbidden,
      status: sendStatus.FORBIDDEN,
    });
  const expected = ownerSchema.safeParse(
    owner ?? {
      userId: request.headers.get(webSessionHeaders.ownerId),
      generation: request.headers.get(webSessionHeaders.generation),
    },
  );
  if (!expected.success)
    return Result.Error({
      code: SessionErrorCode.ActorChanged,
      status: sendStatus.ACTOR_CHANGED,
    });
  const bindingId = await decryptSessionCookie({
    cookie: cookies.get(sessionCookieName),
    key: cookieKey,
    now: sessions.clock(),
  });
  return executeForActor(
    {
      bindingId,
      actor: expected.data,
      replay: request.method === "GET" ? "once" : "never",
      request: execute,
    },
    sessions,
  );
};
