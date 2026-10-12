import {
  CLIENT_ERROR_STATUS,
  logFields,
  SCHEMA_VERSION,
  SERVER_ERROR_STATUS,
} from "../contracts/conts";
import type { Identity, LogRecord } from "../contracts/types";
import { readLogCorrelation } from "./context";
/** Фиксирует начало HTTP-измерения и возвращает одноразовый completion logger с текущей корреляцией и неотрицательной duration; сбой emit не прерывает HTTP-завершение. */
export const createHttpCompletion = ({
  identity,
  emit,
  clock = performance.now.bind(performance),
}: Readonly<{
  identity: Identity;
  emit: (record: LogRecord) => void;
  clock?: () => number;
}>) => {
  const startedAt = clock();
  let completed = false;
  return ({
    method,
    route,
    status,
  }: Readonly<{ method: string; route?: unknown; status: number }>) => {
    if (completed) return;
    completed = true;
    const level = statusLevel(status);
    const record: LogRecord = {
      [logFields.schemaVersion]: SCHEMA_VERSION,
      ...identity,
      [logFields.eventType]: "http_request",
      level,
      ...readLogCorrelation(),
      http: {
        method,
        route,
        [logFields.statusCode]: status,
        [logFields.durationMs]: Math.max(0, clock() - startedAt),
      },
    };
    try {
      emit(record);
    } catch {
      /* Operational logging must not fail HTTP completion. */
    }
  };
};

/** Выбирает error для server status, warn для client status и info для остальных ответов. */
const statusLevel = (status: number) => {
  if (status >= SERVER_ERROR_STATUS) return "error";
  if (status >= CLIENT_ERROR_STATUS) return "warn";
  return "info";
};
