import type { PrivacyErrorCode } from "@insta/contracts/errors";
import type { Choice, PublicPreference } from "@insta/contracts/privacy";
export type Reference = Readonly<{
  contextId: string;
  revision: number;
  policyVersion: number;
  generation: string;
}>;
export type Preference = Reference &
  Readonly<{ choice: Choice; createdAt: number; expiresAt: number }>;
export type ConsentError = `${PrivacyErrorCode}`;
export type Random = Readonly<{
  proof: () => string;
  digest: (proof: string) => Promise<string>;
}>;
export type NativePreferenceView = PublicPreference &
  Readonly<{ needsChoice: boolean }>;
