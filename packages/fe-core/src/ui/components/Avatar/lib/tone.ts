import { avatarTones, identityHashMultiplier } from "../conts";
import type { AvatarTone } from "../types";

/** Детерминированно выбирает тон аватара из палитры по Unicode code points идентификатора. */
export const tone = (identity: string): AvatarTone => {
  let hash = 0;
  for (const character of identity) {
    hash =
      (hash * identityHashMultiplier + (character.codePointAt(0) ?? 0)) %
      avatarTones.length;
  }
  return avatarTones[hash];
};
