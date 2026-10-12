import type { Result } from "@bloodyowl/boxed";
import type { RequestContext } from "../../../../lib/api/server/index";
/** Переводит внутренний Result в BFF-envelope с контекстом и no-store; для ошибки сохраняет HTTP-статус и доступный Retry-After. */
export const conversationReply = <T>(
  result: Result<
    T,
    Readonly<{ code: string; status: number; retryAfter?: string }>
  >,
  context: RequestContext,
) =>
  result.isOk()
    ? Response.json(
        { ok: true, data: result.get(), meta: context },
        { headers: { "Cache-Control": "no-store" } },
      )
    : Response.json(
        {
          ok: false,
          error: {
            code: result.getError().code,
            message: result.getError().code,
          },
          meta: context,
        },
        {
          status: result.getError().status,
          headers: {
            "Cache-Control": "no-store",
            ...(result.getError().retryAfter
              ? { "Retry-After": result.getError().retryAfter }
              : {}),
          },
        },
      );
