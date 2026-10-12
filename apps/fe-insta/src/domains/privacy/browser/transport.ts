import { publicPreferenceSchema } from "@insta/contracts/privacy";
import type { Preferences } from "../ports/preferences";
import { consentEndpoint } from "./conts";
/**
 * Предоставляет browser-порт согласия к same-origin BFF с проверкой ответов по публичной
 * схеме.
 */
export const createBrowserPreferences = (): Preferences => ({
  /**
   * Читает актуальный выбор без HTTP-кеша; HTTP-ошибка или неверный ответ отклоняют запрос.
   */
  read: async () => {
    const response = await fetch(consentEndpoint, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Preference read failed");
    return publicPreferenceSchema.parse(await response.json());
  },
  /**
   * Отправляет выбор и ожидаемую ревизию в BFF; возвращает проверенное предпочтение либо
   * отклоняет запрос.
   */
  save: async (input) => {
    const response = await fetch(consentEndpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("Preference save failed");
    return publicPreferenceSchema.parse(await response.json());
  },
});
