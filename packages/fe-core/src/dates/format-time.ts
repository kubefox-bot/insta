import { clockTimeOptions } from "./conts";
import { formatDateTime } from "./format-date-time";
import type { TimeOptions } from "./types";

/** Форматирует часы в явно переданной временной зоне. */
export const formatTime = (input: TimeOptions): string | null =>
  formatDateTime({ ...input, options: clockTimeOptions });
