import { AsyncLocalStorage } from "node:async_hooks";
import { isSpanContextValid, trace } from "@opentelemetry/api";
import { logFields } from "../contracts/conts";
import { normalizeCorrelation } from "../normalize/normalize";
import type { ScopeContext, TechnicalContext } from "./types";

const storage = new AsyncLocalStorage<ScopeContext>();
/** Выполняет callback в AsyncLocalStorage scope с замороженной нормализованной request/operation корреляцией, изолированной от других async потоков. */
export const withContext = <T>({
  context,
  execute,
}: Readonly<{ context: ScopeContext; execute: () => T }>): T => {
  const accepted = normalizeCorrelation({
    [logFields.requestId]: context.requestId,
    [logFields.operationId]: context.operationId,
  });
  return storage.run(
    Object.freeze({
      ...(accepted.request_id ? { requestId: accepted.request_id } : {}),
      ...(accepted.operation_id ? { operationId: accepted.operation_id } : {}),
    }),
    execute,
  );
};
/** Объединяет текущий локальный scope с валидным активным OTel span; без обоих источников возвращает undefined. */
export const readContext = (): TechnicalContext | undefined => {
  const scope = storage.getStore();
  const span = trace.getActiveSpan()?.spanContext();
  const active =
    span && isSpanContextValid(span)
      ? { traceId: span.traceId, spanId: span.spanId }
      : {};
  return scope || active.traceId ? { ...scope, ...active } : undefined;
};
/** Преобразует текущий технический контекст в нормализованные wire-поля корреляции для лога. */
export const readLogCorrelation = () => {
  const value = readContext();
  return normalizeCorrelation({
    [logFields.requestId]: value?.requestId,
    [logFields.operationId]: value?.operationId,
    [logFields.traceId]: value?.traceId,
    [logFields.spanId]: value?.spanId,
  });
};
