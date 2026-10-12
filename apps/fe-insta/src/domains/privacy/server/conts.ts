export const consentCookieName = "insta_consent";
export const cookieIssuer = "insta/privacy";
export const cookieAudience = "insta/web";
export const consentHeader = consentContextHeader;
export const preferencesPath = "/v1/privacy/preferences";
export const millisecondsPerSecond = 1000;
export const consentSaveStatus = {
  forbidden: 403,
  oversized: 413,
  invalid: 400,
  unavailable: 503,
} as const;

import { consentContextHeader } from "@insta/contracts/privacy";

export const jwePolicy = { algorithm: "dir", encryption: "A256GCM" } as const;
