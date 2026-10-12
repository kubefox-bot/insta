import { dateTimeOptions } from "./conts";
import type { DateTimeOptions } from "./types";

/** Невалидный timestamp возвращает null; ошибки настроек Intl сохраняются. */
export const formatDateTime = ({
  timestampMs,
  locale,
  timeZone,
  options = dateTimeOptions,
}: DateTimeOptions): string | null => {
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
};
