import {
  httpHeaders,
  readCorrelation as readWireCorrelation,
} from "@insta/contracts/http";
import { readContext } from "@insta/fe-core/observability/server";
// A generated ID belongs to the active transport scope. Reuse it in envelopes
// without adding synthetic fields to the incoming wire-header budget.
/** Берёт доверенные идентификаторы текущего контекста поверх заголовков и нормализует wire-корреляцию. */
export const readCorrelation = (headers: Readonly<Record<string, unknown>>) => {
  const context = readContext();
  return readWireCorrelation({
    ...headers,
    ...(context?.requestId
      ? { [httpHeaders.requestId]: context.requestId }
      : {}),
    ...(context?.operationId
      ? { [httpHeaders.operationId]: context.operationId }
      : {}),
  });
};
