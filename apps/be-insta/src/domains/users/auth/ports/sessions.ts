import type { Result } from "@bloodyowl/boxed";
import type { InitialSession, SessionId, UserId } from "../../domain/types";
import type {
  Account,
  AuthError,
  AuthSession,
  CommittedCredentials,
  RevocationProof,
  TerminalSession,
} from "../domain/types";
export type Sessions = Readonly<{
  findAccount: (email: string) => Promise<Account | null>;
  read: (id: SessionId, signal?: AbortSignal) => Promise<AuthSession | null>;
  issue: (
    input: Readonly<{
      userId: UserId;
      session: InitialSession;
      operationId: string;
    }>,
  ) => Promise<Result<Readonly<{ operationId: string }>, AuthError>>;
  rotate: (
    input: Readonly<{
      backendSessionId: SessionId;
      userId: UserId;
      generation: number;
      previousDigest: string;
      nextDigest: string;
      keyDigest: string;
      fingerprint: string;
      ciphertext: string;
      expiresAt: number;
      accessExpiresAt: number;
      operationId: string;
    }>,
  ) => Promise<Result<CommittedCredentials, AuthError>>;
  revoke: (
    input: Readonly<{
      backendSessionId: SessionId;
      proof: RevocationProof;
      operationId: string;
    }>,
  ) => Promise<Result<TerminalSession, AuthError>>;
}>;
