export const calendarDayMs = 86_400_000;
export const calendarDateOptions = {
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
} as const satisfies Intl.DateTimeFormatOptions;
export const clockTimeOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
} as const satisfies Intl.DateTimeFormatOptions;
export const dateTimeOptions = {
  dateStyle: "medium",
  timeStyle: "short",
} as const satisfies Intl.DateTimeFormatOptions;
