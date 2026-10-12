import { AuthErrorCode, RegistrationErrorCode } from "@insta/contracts/errors";

import { httpHeaders } from "@insta/contracts/http";

export const authDependenciesToken = "USERS_AUTH_DEPENDENCIES";
export const authErrorStatus = {
  [AuthErrorCode.InvalidCredentials]: 401,
  [AuthErrorCode.AccessTokenInvalid]: 401,
  [AuthErrorCode.AccessTokenExpired]: 401,
  [AuthErrorCode.RefreshTokenInvalid]: 401,
  [AuthErrorCode.RefreshTokenExpired]: 401,
  [AuthErrorCode.SessionRevoked]: 401,
  [AuthErrorCode.RevokeProofInvalid]: 401,
  [AuthErrorCode.AuthConflict]: 409,
} as const satisfies Record<import("../../domain/types").AuthError, number>;
export const idempotencyHeader = httpHeaders.idempotencyKey;
export const maximumIdempotencyLength = 128;

export const registrationDependenciesToken = "USERS_REGISTRATION_DEPENDENCIES";
export const registrationStatus = {
  [RegistrationErrorCode.RegistrationExpired]: 400,
  [RegistrationErrorCode.CodeInvalid]: 400,
  [RegistrationErrorCode.CodeExhausted]: 429,
  [RegistrationErrorCode.ResendCooldown]: 429,
  [RegistrationErrorCode.ReconfirmEmail]: 409,
  [RegistrationErrorCode.RegistrationProofInvalid]: 401,
  [RegistrationErrorCode.UsernameTaken]: 409,
  [RegistrationErrorCode.RegistrationConflict]: 409,
  [RegistrationErrorCode.RegistrationUnavailable]: 503,
} as const satisfies Record<
  import("../../domain/registration/types").RegistrationError,
  number
>;

export const maximumRegistrationProofLength = 2048;
