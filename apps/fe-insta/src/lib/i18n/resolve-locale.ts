import { defaultLocale, localeCookieName } from "./conts";
import type { Locale } from "./types";
/**
 * Отдаёт приоритет сохранённому ru/en cookie; иначе выбирает поддерживаемый язык по весам
 * Accept-Language. Неверные веса исключает, при отсутствии совпадения использует default
 * locale.
 */
export const resolveLocale = ({
  cookie,
  acceptLanguage,
}: Readonly<{ cookie?: string; acceptLanguage?: string | null }>): Locale => {
  if (cookie === "en" || cookie === "ru") return cookie;
  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [language = "", quality] = entry.trim().split(";");
      return {
        language: language.toLowerCase().split("-")[0],
        quality: quality ? Number(quality.trim().replace(/^q=/, "")) : 1,
      };
    })
    .filter(
      (entry) =>
        Number.isFinite(entry.quality) &&
        entry.quality > 0 &&
        entry.quality <= 1,
    )
    .sort((a, b) => b.quality - a.quality);
  return (
    (preferences.find(
      (entry) => entry.language === "en" || entry.language === "ru",
    )?.language as Locale | undefined) ?? defaultLocale
  );
};
export { localeCookieName };
