import {
  logFields,
  SERVER_ERROR_STATUS,
  SPAN_PATTERN,
  TRACE_PATTERN,
  UUID_V4_PATTERN,
} from "../contracts/conts";
import type { Correlation, Result } from "../contracts/types";
import { requestIdSchema } from "../identifiers/schema";
/** Сужает объектный payload для чтения полей; массивы, null и примитивы заменяет пустым объектом, принятый объект не копирует. */
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** Оставляет только correlation IDs допустимого формата и приводит operation UUID к нижнему регистру. */
export const normalizeCorrelation = (input: Correlation = {}): Correlation => ({
  ...(input.request_id && requestIdSchema.safeParse(input.request_id).success
    ? { [logFields.requestId]: input.request_id }
    : {}),
  ...(input.operation_id && UUID_V4_PATTERN.test(input.operation_id)
    ? { [logFields.operationId]: input.operation_id.toLowerCase() }
    : {}),
  ...(input.trace_id && TRACE_PATTERN.test(input.trace_id)
    ? { [logFields.traceId]: input.trace_id }
    : {}),
  ...(input.span_id && SPAN_PATTERN.test(input.span_id)
    ? { [logFields.spanId]: input.span_id }
    : {}),
});
/** Извлекает code и retryable из HTTP payload; при отсутствии явного result_unknown считает серверные ошибки неопределённым исходом. */
export const normalizeResult = (body: unknown, status: number): Result => {
  const value = record(body);
  return {
    code: typeof value.code === "string" ? value.code : "HTTP_ERROR",
    retryable: value.retryable === true,
    [logFields.resultUnknown]:
      typeof value.result_unknown === "boolean"
        ? value.result_unknown
        : status >= SERVER_ERROR_STATUS,
  };
};
