import type { AuthCode } from "@insta/contracts/auth";
import type { SessionId, UserId } from "../../domain/types";
export type AuthError = AuthCode;
export type Actor = Readonly<{
  userId: UserId;
  backendSessionId: SessionId;
  username: string;
  accessExpiresAt: number;
}>;
export type Account = Readonly<{
  id: UserId;
  username: string;
  passwordHash: string;
}>;
export type AuthSession = Readonly<{
  backendSessionId: SessionId;
  user: Readonly<{ id: UserId; username: string }>;
  refreshDigest: string;
  revokeDigest: string;
  generation: number;
  state: "active" | "revoked" | "expired";
  issuedAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
}>;
export type AccessClaims = Readonly<{
  userId: UserId;
  backendSessionId: SessionId;
  accessExpiresAt: number;
}>;
export type CommittedCredentials = Readonly<{
  ciphertext: string;
  operationId: string;
}>;
export type TerminalSession = Readonly<{
  state: "revoked" | "expired";
  operationId?: string | undefined;
}>;
export type SessionCredentials = import("zod").infer<
  typeof import("./credentials").sessionCredentialsSchema
>;
export type RefreshCredentials = import("zod").infer<
  typeof import("./credentials").refreshCredentialsSchema
>;
export type RotationInput = Readonly<{
  previousDigest: string;
  keyDigest: string;
  fingerprint: string;
  generation: number;
  expiresAt: number;
  accessExpiresAt: number;
}>;
export type RotationState = Readonly<{
  refreshDigest: string;
  generation: number;
  state: "active" | "revoked" | "expired";
  expiresAt: number;
  absoluteExpiresAt: number;
  previousRefresh: ReadonlyArray<
    Readonly<{ digest: string; keyDigest: string; fingerprint: string }>
  >;
}>;
export type RotationDecision = Readonly<{
  state: "rotate" | "replay" | "revoke";
}>;
export type RevocationProof = Readonly<{ kind: "secret"; digest: string }>;
export type RevocationState = Readonly<{
  userId: string;
  revokeDigest: string;
  state: "active" | "revoked" | "expired";
  expiresAt: number;
  absoluteExpiresAt: number;
}>;
