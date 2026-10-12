import { CommonErrorCode } from "@insta/contracts/errors";
import { httpHeaderNames, readCorrelation } from "@insta/contracts/http";
import { terminationSignals } from "@insta/fe-core/lifecycle/server";
import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import {
  createLocaleHtmlTransform,
  livenessPath,
  prepareRequest,
} from "./app/http/server/index.ts";
import { inspectRequestForRoute } from "./app/http/server/limits/index";
import {
  closeApplication,
  prepareShutdown,
} from "./app/lifecycle/server/index.ts";
import { readObservability } from "./app/observability/server/index.ts";
import { initializeSessions } from "./app/users/server/session/index";
import {
  acceptsCookieMutation,
  cookieOriginForbiddenStatus,
  requestLimitStatus,
  safeHttpMethods,
} from "./lib/http/server/index";
import {
  failedHttpStatus,
  unhandledErrorResponse,
} from "./lib/observability/server/index";

if (!building) {
  for (const signal of terminationSignals) process.on(signal, prepareShutdown);
  initializeSessions().catch(() => {
    process.stderr.write(
      "Session startup unavailable; requests will retry acquisition\n",
    );
  });
}
/** Оборачивает запрос в контекст корреляции и наблюдаемости; подготовка locals, проверка cookie-origin и лимитов предшествуют разрешению маршрута. */
const handleApplicationRequest: Handle = async ({ event, resolve }) => {
  const request = event.request;
  const correlation = readCorrelation(Object.fromEntries(request.headers));
  const runtime = readObservability();
  return runtime.withRequest({
    correlation,
    headers: {
      traceparent: request.headers.get("traceparent") ?? undefined,
    },
    /** Подготавливает request-owned зависимости, отклоняет запрещённую cookie-мутацию либо превышение лимитов и добавляет request-id к ответу. Завершает метрику также при исключении, затем пробрасывает исходную ошибку. */
    execute: async () => {
      const complete = runtime.completion();
      try {
        event.locals.correlation = correlation;
        await prepareRequest({ event, correlation });
        const forbiddenOrigin =
          // Privacy owns its established empty 403 response and uses the same guard.
          event.route.id !== "/api/privacy/consent" &&
          !safeHttpMethods.some((method) => method === request.method) &&
          !acceptsCookieMutation({
            request: event.request,
            origin: event.url.origin,
          });
        if (forbiddenOrigin) {
          complete({
            method: request.method,
            route: event.route.id ?? undefined,
            status: cookieOriginForbiddenStatus,
          });
          const code = CommonErrorCode.Forbidden;
          return Response.json(
            {
              ok: false,
              error: { code, message: code },
              meta: correlation,
            },
            {
              status: cookieOriginForbiddenStatus,
              headers: {
                "Cache-Control": "no-store",
                [httpHeaderNames.requestId]: correlation.requestId,
              },
            },
          );
        }
        const limit = await inspectRequestForRoute(event);
        const response = limit
          ? new Response("Request exceeds limit", {
              status: requestLimitStatus[limit],
            })
          : await resolve(event, {
              transformPageChunk: createLocaleHtmlTransform(event),
            });
        response.headers.set(httpHeaderNames.requestId, correlation.requestId);
        complete({
          method: request.method,
          route: event.route.id ?? undefined,
          status: response.status,
        });
        return response;
      } catch (error) {
        complete({
          method: request.method,
          route: event.route.id ?? undefined,
          status: failedHttpStatus,
        });
        throw error;
      }
    },
  });
};
/** Пропускает только совпавший по pathname и route.id liveness прямо в Kit; остальные запросы проходят общую подготовку и ограничения. */
export const handle: Handle = ({ event, resolve }) => {
  if (event.url.pathname === livenessPath && event.route.id === livenessPath)
    return resolve(event);
  return handleApplicationRequest({ event, resolve });
};
// Bun adapter emits this event after draining HTTP requests.
process.on("sveltekit:shutdown", () => {
  closeApplication().catch(() => {
    process.stderr.write("Application shutdown failed\n");
    process.exitCode = 1;
  });
});

/** Передаёт необработанное исключение серверной наблюдаемости и возвращает фиксированное публичное описание без внутренних подробностей. */
export const handleError: HandleServerError = ({ error }) => {
  readObservability().exception(error);
  return unhandledErrorResponse;
};
