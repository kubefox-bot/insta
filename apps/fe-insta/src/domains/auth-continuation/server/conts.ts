import { ContinuationErrorCode } from "@insta/contracts/errors";
export const contextCookieName = "insta_continuation";
export const contextAudience = "insta/continuation/v1";
export const millisecondsPerSecond = 1000;
export const intentCodes = {
  unavailable: ContinuationErrorCode.IntentUnavailable,
  invalid: ContinuationErrorCode.IntentInvalid,
} as const;
export const intentStatus = {
  [intentCodes.unavailable]: 409,
  [intentCodes.invalid]: 400,
} as const;

export const jwePolicy = { algorithm: "dir", encryption: "A256GCM" } as const;

export const continuationHttp = { seeOther: 303, forbidden: 403 } as const;
