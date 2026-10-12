import {
  AuthErrorCode,
  CommonErrorCode,
  RegistrationErrorCode,
} from "@insta/contracts/errors";

export const registrationCookieName = "insta_registration";
export const registrationCookieAudience = "insta/registration/v1";
export const millisecondsPerSecond = 1000;
export const registrationStatus = {
  [CommonErrorCode.ValidationFailed]: 400,
  [RegistrationErrorCode.RegistrationExpired]: 409,
  [RegistrationErrorCode.CodeInvalid]: 400,
  [RegistrationErrorCode.CodeExhausted]: 429,
  [RegistrationErrorCode.ResendCooldown]: 429,
  [RegistrationErrorCode.ReconfirmEmail]: 409,
  [RegistrationErrorCode.RegistrationProofInvalid]: 401,
  [RegistrationErrorCode.UsernameTaken]: 409,
  [RegistrationErrorCode.RegistrationConflict]: 409,
  [RegistrationErrorCode.RegistrationUnavailable]: 503,
  [AuthErrorCode.AuthBusy]: 503,
  [AuthErrorCode.AuthRateLimited]: 429,
  [AuthErrorCode.AuthLimitsUnavailable]: 503,
} as const;

export const jwePolicy = { algorithm: "dir", encryption: "A256GCM" } as const;
