import {
  AuthErrorCode,
  CommonErrorCode,
  SessionErrorCode,
} from "@insta/contracts/errors";

export const methodNotAllowedStatus = 405;
export const webAuthCodes = {
  required: SessionErrorCode.SessionRequired,
  unavailable: SessionErrorCode.SessionUnavailable,
  busy: SessionErrorCode.SessionBusy,
  changed: SessionErrorCode.ActorChanged,
  invalid: AuthErrorCode.InvalidCredentials,
  rateLimited: AuthErrorCode.AuthRateLimited,
  authBusy: AuthErrorCode.AuthBusy,
  limitsUnavailable: AuthErrorCode.AuthLimitsUnavailable,
  validation: CommonErrorCode.ValidationFailed,
  forbidden: CommonErrorCode.Forbidden,
} as const;
export const authStatus = {
  [webAuthCodes.required]: 401,
  [webAuthCodes.unavailable]: 503,
  [webAuthCodes.busy]: 503,
  [webAuthCodes.changed]: 409,
  [webAuthCodes.invalid]: 401,
  [webAuthCodes.rateLimited]: 429,
  [webAuthCodes.authBusy]: 503,
  [webAuthCodes.limitsUnavailable]: 503,
  [webAuthCodes.validation]: 400,
  [webAuthCodes.forbidden]: 403,
} as const satisfies Record<
  (typeof webAuthCodes)[keyof typeof webAuthCodes],
  number
>;
export const authSeeOtherStatus = 303;
export const formErrorFields = {
  login: "email",
  start: "email",
  resend: "email",
  verify: "code",
  complete: "username",
  logout: "email",
} as const;
