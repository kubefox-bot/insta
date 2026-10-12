export type RelativeDateTimeOptions = Readonly<{
  timestampMs: number;
  nowMs: number;
  locale: string;
  timeZone: string;
}>;

export type TimeOptions = Readonly<{
  timestampMs: number;
  locale: string;
  timeZone: string;
}>;

export type DateTimePresentationOptions = Readonly<
  Pick<
    Intl.DateTimeFormatOptions,
    | "dateStyle"
    | "timeStyle"
    | "weekday"
    | "era"
    | "year"
    | "month"
    | "day"
    | "hour"
    | "minute"
    | "second"
    | "fractionalSecondDigits"
    | "hour12"
    | "hourCycle"
    | "timeZoneName"
    | "formatMatcher"
  >
>;

export type DateTimeOptions = TimeOptions &
  Readonly<{
    options?: DateTimePresentationOptions;
  }>;
