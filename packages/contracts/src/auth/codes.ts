export enum AuthErrorCode {
  InvalidCredentials = "INVALID_CREDENTIALS",
  AccessTokenInvalid = "ACCESS_TOKEN_INVALID",
  AccessTokenExpired = "ACCESS_TOKEN_EXPIRED",
  RefreshTokenInvalid = "REFRESH_TOKEN_INVALID",
  RefreshTokenExpired = "REFRESH_TOKEN_EXPIRED",
  SessionRevoked = "SESSION_REVOKED",
  RevokeProofInvalid = "REVOKE_PROOF_INVALID",
  AuthConflict = "AUTH_CONFLICT",
  AuthBusy = "AUTH_BUSY",
  AuthLimitsUnavailable = "AUTH_LIMITS_UNAVAILABLE",
  AuthRateLimited = "AUTH_RATE_LIMITED",
}

export enum RegistrationErrorCode {
  RegistrationExpired = "REGISTRATION_EXPIRED",
  CodeInvalid = "CODE_INVALID",
  CodeExhausted = "CODE_EXHAUSTED",
  ResendCooldown = "RESEND_COOLDOWN",
  ReconfirmEmail = "RECONFIRM_EMAIL",
  RegistrationProofInvalid = "REGISTRATION_PROOF_INVALID",
  UsernameTaken = "USERNAME_TAKEN",
  RegistrationConflict = "REGISTRATION_CONFLICT",
  RegistrationUnavailable = "REGISTRATION_UNAVAILABLE",
}

export enum SessionErrorCode {
  SessionRequired = "SESSION_REQUIRED",
  SessionUnavailable = "SESSION_UNAVAILABLE",
  SessionBusy = "SESSION_BUSY",
  ActorChanged = "ACTOR_CHANGED",
  AuthUnavailable = "AUTH_UNAVAILABLE",
}
