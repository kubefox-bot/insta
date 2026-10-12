import {
  LEVELS,
  logFields,
  SAFE_EXCEPTION,
  SCHEMA_VERSION,
} from "../contracts/conts";
import type {
  Correlation,
  Identity,
  LogRecord,
  Outcome,
  Result,
} from "../contracts/types";
import { normalizeCorrelation } from "../normalize/normalize";
/** Собирает business log с уровнем по outcome и нормализованной корреляцией; копирует HTTP-поля, а произвольные attributes в запись не переносит. */
export const buildBusinessLog = (
  options: Readonly<{
    identity: Identity;
    operation: string;
    outcome: Outcome;
    result?: Result | undefined;
    correlation?: Correlation;
    authority?: string | undefined;
    attributes?: Record<string, unknown> | undefined;
    http?: Record<string, unknown> | undefined;
  }>,
): LogRecord => ({
  [logFields.schemaVersion]: SCHEMA_VERSION,
  ...options.identity,
  [logFields.eventType]: "business_operation",
  level: LEVELS[options.outcome],
  ...normalizeCorrelation(options.correlation),
  business: {
    authority: options.authority ?? "server_canonical",
    operation: options.operation,
    outcome: options.outcome,
    ...options.result,
  },
  ...(options.http ? { http: { ...options.http } } : {}),
});
/** Собирает exception log с фиксированной безопасной проекцией, исключая исходные message, stack и payload ошибки. */
export const buildExceptionLog = (
  options: Readonly<{
    identity: Identity;
    exception: unknown;
    correlation?: Correlation;
  }>,
): LogRecord => ({
  [logFields.schemaVersion]: SCHEMA_VERSION,
  ...options.identity,
  [logFields.eventType]: "exception",
  level: "error",
  ...normalizeCorrelation(options.correlation),
  exception: { ...SAFE_EXCEPTION },
});
