import { Result } from "@bloodyowl/boxed";
import { directoryQueryLimits } from "@insta/contracts/directory";
import { z } from "zod";
import type { SearchUsers200 } from "../../../../lib/api/generated/types/SearchUsers";
import type { RequestContext } from "../../../../lib/api/server/index";
import { webSessionHeaders } from "../../../../lib/session/contracts/index";
import type { SessionDependencies } from "../../../../lib/session/server/index";
import {
  decryptSessionCookie,
  executeForActor,
  sessionCookieName,
} from "../../../../lib/session/server/index";
import type { AuthRequest } from "../types";
import type { createDirectoryBackend } from "./backend";

const querySchema = z.strictObject({
  q: z.string().min(directoryQueryLimits.min).max(directoryQueryLimits.max),
});
/**
 * Проверяет параметры поиска и привязку запроса к userId/generation, выполняет поиск от этого
 * actor и возвращает некешируемый результат либо точный статус отказа.
 */
export const directoryRequest = async (
  { request, cookies }: AuthRequest,
  dependencies: Readonly<{
    sessions: SessionDependencies;
    cookieKey: Uint8Array;
    context: RequestContext;
    backend: ReturnType<typeof createDirectoryBackend>;
  }>,
) => {
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const bindingId = await decryptSessionCookie({
    cookie: cookies.get(sessionCookieName),
    key: dependencies.cookieKey,
    now: dependencies.sessions.clock(),
  });
  const result: Result<
    SearchUsers200["data"],
    Readonly<{ code: string; status: number }>
  > = query.success
    ? await executeForActor(
        {
          bindingId,
          actor: {
            userId: request.headers.get(webSessionHeaders.ownerId) ?? "",
            generation: request.headers.get(webSessionHeaders.generation) ?? "",
          },
          /**
           * Выполняет backend-поиск с проверенной строкой после получения токена ожидаемого
           * actor.
           */
          request: (accessToken) =>
            dependencies.backend({ accessToken, q: query.data.q }),
        },
        dependencies.sessions,
      )
    : Result.Error({ code: "INVALID_INPUT", status: 400 });
  return result.isOk()
    ? Response.json(
        { ok: true, data: result.get(), meta: dependencies.context },
        { headers: { "Cache-Control": "no-store" } },
      )
    : Response.json(
        {
          ok: false,
          error: {
            code: result.getError().code,
            message: result.getError().code,
          },
          meta: dependencies.context,
        },
        {
          status: result.getError().status,
          headers: { "Cache-Control": "no-store" },
        },
      );
};
