import { httpHeaderNames, readCorrelation } from "@insta/contracts/http";
import type { RequestEvent, RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { healthStatus, unavailableError } from "./conts";
/** Проверяет готовность через request-owned checkReadiness и возвращает 200/503 envelope с корреляцией и no-store. Если locals ещё не содержит correlation, читает её из headers; исключение readiness не скрывается как успешный ответ. */
export const GET = (async ({
  locals,
  request,
}: Pick<RequestEvent, "locals" | "request">) => {
  const meta =
    locals.correlation ?? readCorrelation(Object.fromEntries(request.headers));
  const ready = await locals.checkReadiness();
  return json(
    ready
      ? { ok: true, data: { status: "ok" }, meta }
      : { ok: false, error: unavailableError, meta },
    {
      status: ready ? healthStatus.ready : healthStatus.unavailable,
      headers: {
        "Cache-Control": "no-store",
        [httpHeaderNames.requestId]: meta.requestId,
      },
    },
  );
}) satisfies RequestHandler;
