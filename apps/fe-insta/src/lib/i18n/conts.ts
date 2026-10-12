import en from "./catalogs/en.json";
import ru from "./catalogs/ru.json";
import type { ConsentMessages, Locale } from "./types";
export const defaultLocale = "en";
export const messages = { en, ru } as const satisfies Record<
  Locale,
  Readonly<{ consent: ConsentMessages }>
>;
export const localeCookieName = "insta_locale";
export const localeSeeOtherStatus = 303;
