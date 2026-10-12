import { isCurrent } from "../domain/preference";
import type { Reference } from "../domain/types";
import type { Preferences } from "../ports/preferences";
/**
 * Повторно проверяет актуальное согласие all и точное совпадение ссылки перед аналитикой.
 * Отсутствие разрешения и недоступность хранилища различает; оба исхода не разрешают
 * отправку.
 */
export const allowAnalytics = async (
  { reference }: Readonly<{ reference?: Reference }>,
  {
    preferences,
    clock,
  }: Readonly<{ preferences: Preferences; clock: () => number }>,
): Promise<"allowed" | "denied" | "unavailable"> => {
  if (!reference) return "denied";
  try {
    const generation = await preferences.generation();
    if (generation !== reference.generation) return "denied";
    const preference = await preferences.find({
      contextId: reference.contextId,
      generation,
    });
    return preference &&
      isCurrent({ preference, generation, now: clock() }) &&
      preference.choice === "all" &&
      preference.revision === reference.revision &&
      preference.policyVersion === reference.policyVersion
      ? "allowed"
      : "denied";
  } catch {
    return "unavailable";
  }
};
