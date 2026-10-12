import { calendarDateOptions, calendarDayMs, clockTimeOptions } from "./conts";
import type { RelativeDateTimeOptions } from "./types";

// Project timezone calendar fields onto UTC solely to compare calendar dates.
// This is not a duration between the original instants (DST days vary in length).
/** Проецирует календарные поля Intl в номер UTC-дня для сравнения дат в выбранной зоне; это presentation, не длительность между исходными instant и не TTL. */
const calendarDay = (date: Date, formatter: Intl.DateTimeFormat): number => {
  const parts = formatter.formatToParts(date);
  /** Извлекает числовое календарное поле из частей Intl для построения сравнимой даты. */
  const field = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === name)?.value);
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(field("year"), field("month") - 1, field("day"));
  return calendarDate.getTime() / calendarDayMs;
};

/** Invalid timestamps return null; invalid locale/timezone settings throw Intl errors. */
export const formatRelativeDateTime = ({
  timestampMs,
  nowMs,
  locale,
  timeZone,
}: RelativeDateTimeOptions): string | null => {
  const date = new Date(timestampMs);
  const now = new Date(nowMs);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime()))
    return null;
  const calendar = new Intl.DateTimeFormat("en-US", {
    ...calendarDateOptions,
    timeZone,
  });
  const difference = calendarDay(date, calendar) - calendarDay(now, calendar);
  const dateLabel =
    difference === 0 || difference === -1
      ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
          difference,
          "day",
        )
      : new Intl.DateTimeFormat(locale, {
          ...calendarDateOptions,
          timeZone,
        }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    ...clockTimeOptions,
    timeZone,
  }).format(date);
  return `${dateLabel}, ${time}`;
};
