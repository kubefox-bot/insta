import { Result } from "@bloodyowl/boxed";
import { PrivacyErrorCode } from "@insta/contracts/errors";
import {
  consentPolicyVersion,
  type SaveChoice,
} from "@insta/contracts/privacy";
import { proofPattern } from "../domain/conts";
import { nextPreference, retainCurrent } from "../domain/preference";
import type { ConsentError, Preference, Random } from "../domain/types";
import type { Preferences } from "../ports/preferences";
/**
 * Проверяет версию политики и proof, сохраняет выбор с контролем ревизии и возвращает
 * proof контекста. Истёкший контекст заменяет новым; сбой зависимостей возвращает
 * unavailable.
 */
export const savePreference = async (
  input: SaveChoice &
    Readonly<{ contextProof?: string | undefined; source: string }>,
  {
    preferences,
    clock,
    random,
  }: Readonly<{
    preferences: Preferences;
    clock: () => number;
    random: Random;
  }>,
): Promise<
  Result<
    Readonly<{ contextProof: string; preference: Preference }>,
    ConsentError
  >
> => {
  if (input.policyVersion !== consentPolicyVersion)
    return Result.Error(PrivacyErrorCode.StalePolicy);
  if (input.contextProof && !proofPattern.test(input.contextProof))
    return Result.Error(PrivacyErrorCode.InvalidProof);
  try {
    const now = clock();
    const generation = await preferences.generation();
    const existing = input.contextProof
      ? await preferences.find({
          contextId: await random.digest(input.contextProof),
          generation,
        })
      : undefined;
    const previous = retainCurrent({ preference: existing, generation, now });
    if (previous && previous.revision !== input.expectedRevision)
      return Result.Error(PrivacyErrorCode.Conflict);
    const contextProof =
      previous && input.contextProof ? input.contextProof : random.proof();
    const preference = nextPreference({
      previous,
      contextId: await random.digest(contextProof),
      choice: input.choice,
      generation,
      now,
    });
    const outcome = await preferences.save({
      preference,
      expectedRevision: previous?.revision,
      source: input.source,
      now,
    });
    return outcome === "saved"
      ? Result.Ok({ contextProof, preference })
      : Result.Error(outcome);
  } catch {
    return Result.Error(PrivacyErrorCode.Unavailable);
  }
};
