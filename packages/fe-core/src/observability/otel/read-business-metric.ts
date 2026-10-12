import { UNKNOWN_LABEL } from "../contracts/conts";
import type { LogRecord } from "../contracts/types";
import type { BusinessMetric } from "./types";

/** Читает строковый label без приведения иных значений к строке. */
const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** Читает конечную HTTP duration_ms и ограничивает снизу нулём; отсутствие или нечисловое значение пропускает. */
const durationMilliseconds = (record: LogRecord): number | undefined => {
  const value = (record.http as Record<string, unknown> | undefined)
    ?.duration_ms;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
};

/** Выделяет бизнес-метрику: посторонний event_type возвращает undefined, неполная business запись — пустой объект для счётчика нарушений. */
export const readBusinessMetric = (
  record: LogRecord,
): BusinessMetric | undefined => {
  if (record.event_type !== "business_operation") return undefined;
  const business = record.business as Record<string, unknown> | undefined;
  const operation = text(business?.operation);
  const outcome = text(business?.outcome);
  if (!operation || !outcome) return {};
  return {
    attributes: {
      code: text(business?.code) ?? UNKNOWN_LABEL,
      operation,
      outcome,
    },
    durationMs: durationMilliseconds(record),
  };
};
