import { proofPattern } from "../domain/conts";
import { isCurrent } from "../domain/preference";
import type { Random, Reference } from "../domain/types";
import type { Preferences } from "../ports/preferences";
/**
 * Разрешает proof в ссылку на текущую ревизию согласия all. При неверном proof, истечении
 * или сбое возвращает отсутствие ссылки, чтобы необязательная аналитика не получила
 * разрешение.
 */
export const resolveAnalyticsReference = async (
  { contextProof }: Readonly<{ contextProof?: string }>,
  {
    preferences,
    clock,
    random,
  }: Readonly<{
    preferences: Preferences;
    clock: () => number;
    random: Random;
  }>,
): Promise<Reference | undefined> => {
  if (!contextProof || !proofPattern.test(contextProof)) return undefined;
  try {
    const generation = await preferences.generation();
    const preference = await preferences.find({
      contextId: await random.digest(contextProof),
      generation,
    });
    if (
      preference?.choice !== "all" ||
      !isCurrent({ preference, generation, now: clock() })
    )
      return undefined;
    return {
      contextId: preference.contextId,
      revision: preference.revision,
      policyVersion: preference.policyVersion,
      generation: preference.generation,
    };
  } catch {
    return undefined;
  }
};
