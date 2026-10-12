import { PrivacyErrorCode } from "@insta/contracts/errors";
export const privacyDependenciesToken = "PRIVACY_DEPENDENCIES";
export const consentHeader = "x-consent-context";
export const errorStatus = {
  [PrivacyErrorCode.StalePolicy]: 400,
  [PrivacyErrorCode.Conflict]: 409,
  [PrivacyErrorCode.InvalidProof]: 400,
  [PrivacyErrorCode.RateLimited]: 429,
  [PrivacyErrorCode.Unavailable]: 503,
} as const;
