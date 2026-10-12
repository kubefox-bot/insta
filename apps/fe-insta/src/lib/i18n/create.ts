import { formatDateTime } from "@insta/fe-core/dates";
import { IntlMessageFormat } from "intl-messageformat";
import type { Locale } from "./types";
/**
 * Создаёт форматтеры для выбранного каталога и локали без общего изменяемого состояния.
 * Даты используют явную timezone либо системную; неизвестные ключи считаются ошибкой
 * каталога.
 */
export const createI18n = ({
  locale,
  messages,
  dateOptions,
}: Readonly<{
  locale: Locale;
  messages: Readonly<Record<string, string>>;
  dateOptions?: Readonly<Intl.DateTimeFormatOptions>;
}>) => ({
  /**
   * Форматирует ICU-шаблон с переданными значениями. Отсутствующий ключ вызывает ошибку,
   * чтобы повреждённый каталог не маскировался текстом ключа.
   */
  t: (key: string, values?: Readonly<Record<string, string | number>>) => {
    const template = messages[key];
    if (!template) throw new Error(`Unknown message: ${key}`);
    return String(new IntlMessageFormat(template, locale).format(values));
  },
  /**
   * Форматирует дату через общий Intl-владелец с настройками локали и timezone.
   * Недопустимое время преобразует в RangeError, не подставляя текущую дату.
   */
  formatDate: (date: Date | number) => {
    const formatted = formatDateTime({
      timestampMs: date instanceof Date ? date.getTime() : date,
      locale,
      timeZone:
        dateOptions?.timeZone ??
        new Intl.DateTimeFormat().resolvedOptions().timeZone,
      options: { dateStyle: "medium", timeStyle: "short", ...dateOptions },
    });
    if (formatted === null) throw new RangeError("Invalid time value");
    return formatted;
  },
  /**
   * Показывает число по правилам выбранной локали через Intl, не меняя исходное числовое
   * значение.
   */
  formatNumber: (value: number) => new Intl.NumberFormat(locale).format(value),
});
