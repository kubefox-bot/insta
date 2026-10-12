import { defaultLocale } from "./conts";
import type { Locale } from "./types";
/**
 * Сужает внешнее значение к поддерживаемым ru/en; любые другие значения заменяет общей
 * локалью по умолчанию.
 */
export const selectLocale = (value: unknown): Locale =>
  value === "en" || value === "ru" ? value : defaultLocale;
