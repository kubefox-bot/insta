import { SessionErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { sessionCookieName } from "../../../lib/session/server/cookies";
import type { AuthRequest } from "./types";

const actorSchema = z.object({
  userId: z.string(),
  username: z.string(),
  generation: z.string(),
});
const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: actorSchema }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) }),
]);
/**
 * Проецирует серверную сессию в actor/status для страницы: отсутствие cookie или
 * session_required означает гостя, ошибки чтения и прочие отказы — unavailable.
 */
export const loadSession = async ({
  auth,
  request,
  origin,
  cookies,
}: AuthRequest &
  Readonly<{
    auth: Readonly<{ session: (input: AuthRequest) => Promise<Response> }>;
  }>) => {
  if (!cookies.get(sessionCookieName))
    return { actor: null, status: "guest" as const };
  const read = new Request(request.url, {
    headers: request.headers,
    method: "GET",
  });
  try {
    const response = responseSchema.parse(
      await (await auth.session({ request: read, origin, cookies })).json(),
    );
    if (response.ok)
      return { actor: response.data, status: "authenticated" as const };
    return {
      actor: null,
      status:
        response.error.code === SessionErrorCode.SessionRequired
          ? ("guest" as const)
          : ("unavailable" as const),
    };
  } catch {
    return { actor: null, status: "unavailable" as const };
  }
};
