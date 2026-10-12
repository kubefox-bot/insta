import type { AuthErrorCode } from "./codes";

export type AuthCode =
  | AuthErrorCode.InvalidCredentials
  | AuthErrorCode.AccessTokenInvalid
  | AuthErrorCode.AccessTokenExpired
  | AuthErrorCode.RefreshTokenInvalid
  | AuthErrorCode.RefreshTokenExpired
  | AuthErrorCode.SessionRevoked
  | AuthErrorCode.RevokeProofInvalid
  | AuthErrorCode.AuthConflict;
