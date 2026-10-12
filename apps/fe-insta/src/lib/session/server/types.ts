import type { SessionErrorCode } from "@insta/contracts/errors";
import type { Correlation } from "@insta/contracts/http";

export type WebActor = Readonly<{
  userId: string;
  username: string;
  generation: string;
}>;
export type RotatingCredentials = Readonly<{
  accessToken: string;
  refreshToken: string;
}>;
export type RefreshCredentials = RotatingCredentials &
  Readonly<{
    user: Readonly<{ id: string; username: string }>;
    backendSessionId: string;
    accessExpiresAt: number;
    expiresAt: number;
    absoluteExpiresAt: number;
  }>;
export type SessionCredentials = RefreshCredentials &
  Readonly<{ revokeSecret: string }>;
export type RefreshAttempt = Readonly<{
  key: string;
  credentials: string;
  revision: number;
  startedAt: number;
  recoverUntil: number;
  leaseOwner: string;
  leaseGeneration: number;
  leaseUntil: number;
  state: "running" | "unknown";
}>;
export type Revocation = Readonly<{
  key: string;
  nextAttemptAt: number;
  failures: number;
}>;
export type Binding = Readonly<{
  bindingId: string;
  user: Readonly<{ id: string; username: string }>;
  backendSessionId: string;
  credentials: string;
  revokeSecret: string;
  accessExpiresAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  revision: number;
  blocked: boolean;
  revocationConfirmed?: boolean;
  attempt?: RefreshAttempt;
  revocation?: Revocation;
  cleanupAt?: Date;
}>;
export type SessionError =
  | SessionErrorCode.SessionRequired
  | SessionErrorCode.SessionUnavailable
  | SessionErrorCode.SessionBusy
  | SessionErrorCode.ActorChanged;
export type RefreshDecision = "start" | "takeover" | "wait" | "blocked";
export type BackendError = Readonly<{
  code: string;
  meta?: Readonly<Pick<Correlation, "requestId" | "operationId">>;
}>;
