import { proofPattern } from "../domain/conts";
import {
  isCurrent,
  necessaryPreference,
  publicPreference,
} from "../domain/preference";
import type { Random } from "../domain/types";
import type { Preferences } from "../ports/preferences";
/**
 * Читает текущий выбор по хешу proof; при отсутствии, устаревании или сбое возвращает
 * necessary с запросом выбора.
 */
export const readPreference = async (
  { contextProof }: Readonly<{ contextProof?: string | undefined }>,
  {
    preferences,
    clock,
    random,
  }: Readonly<{
    preferences: Preferences;
    clock: () => number;
    random: Random;
  }>,
) => {
  if (!contextProof || !proofPattern.test(contextProof))
    return necessaryPreference();
  try {
    const generation = await preferences.generation();
    const preference = await preferences.find({
      contextId: await random.digest(contextProof),
      generation,
    });
    return preference && isCurrent({ preference, generation, now: clock() })
      ? publicPreference(preference)
      : necessaryPreference();
  } catch {
    return necessaryPreference();
  }
};
