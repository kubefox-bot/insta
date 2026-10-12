export type UserId = string & { readonly __userId: unique symbol };
export type SessionId = string & { readonly __sessionId: unique symbol };
export type PendingUser = Readonly<{
  id: UserId;
  status: "pending_setup";
  emailKey: string;
  emailVerifiedAt: number;
  registrationExpiresAt: number;
}>;
export type ActiveUser = Readonly<{
  id: UserId;
  status: "active";
  username: string;
}>;
export type InitialSession = Readonly<{
  backendSessionId: SessionId;
  refreshDigest: string;
  revokeDigest: string;
  issuedAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
}>;
export type Activation = Readonly<{
  userId: UserId;
  tokenDigest: string;
  username: string;
  passwordHash: string;
  session: InitialSession;
  now: number;
  operationId: string;
  replay?: Readonly<{
    keyDigest: string;
    fingerprint: string;
    ciphertext: string;
  }>;
}>;
export type ActivationResult =
  | Readonly<{
      state: "activated";
      user: ActiveUser;
      backendSessionId: SessionId;
    }>
  | Readonly<{ state: "replayed"; ciphertext: string; operationId: string }>;
export type PersistenceError =
  | "emailExists"
  | "activeUser"
  | "invalidProof"
  | "registrationExpired"
  | "usernameTaken"
  | "conflict"
  | "invalidSession";
export type AuthLimit = "otpEmail" | "otpIp" | "loginEmail" | "loginIp";
export type LimitOutcome =
  | Readonly<{ state: "allowed" }>
  | Readonly<{ state: "limited"; retryAfterSeconds: number }>;
export type AuthMutation = "otp" | "login";
export type AuthAdmissionFailure =
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "limited"; retryAfterSeconds: number }>;
