import type { IncomingMessage, ServerResponse } from "node:http";
import { httpHeaderNames, readCorrelation } from "@insta/contracts/http";
import {
  createHttpCompletion,
  withContext,
} from "@insta/fe-core/observability/server";
import { abortedHttpStatus, identity } from "./conts";
import type { RuntimeObservability } from "./types";
/** Устанавливает HTTP-корреляцию и trace scope; журналирует шаблон маршрута вместо потенциально чувствительного URL. */
export const createHttpContext =
  ({ adapter, tracing }: RuntimeObservability) =>
  (
    request: IncomingMessage & { readonly route?: { readonly path?: unknown } },
    response: ServerResponse,
    next: () => void,
  ) => {
    const correlation = readCorrelation(request.headers);
    response.setHeader(httpHeaderNames.requestId, correlation.requestId);
    const scope = tracing.startScope({
      name: "http.request",
      headers: {
        traceparent:
          typeof request.headers.traceparent === "string"
            ? request.headers.traceparent
            : undefined,
      },
    });
    /** Выполняет продолжение одновременно в trace scope и контексте корреляции данного запроса. */
    const run = <T>(execute: () => T) =>
      scope.run(() => withContext({ context: correlation, execute }));
    const complete = createHttpCompletion({ identity, emit: adapter.emit });
    /** Однократно снимает слушатели завершения ответа, записывает исход и закрывает scope даже при ошибке telemetry. */
    const finish = () =>
      run(() => {
        response.off("finish", finish);
        response.off("close", finish);
        // Only Express's matched route template is used; no fallback to raw URL.
        try {
          complete({
            method: request.method ?? "unknown",
            route: request.route?.path,
            status: response.writableFinished
              ? response.statusCode
              : abortedHttpStatus,
          });
        } finally {
          scope.end();
        }
      });
    response.once("finish", finish);
    response.once("close", finish);
    return run(next);
  };
