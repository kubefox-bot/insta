import type { Random } from "../../domain/types";
import type { Preferences } from "../../ports/preferences";
export type PrivacyDependencies = Readonly<{
  preferences: Preferences;
  clock: () => number;
  random: Random;
}>;
