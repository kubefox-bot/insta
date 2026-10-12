import type { Result } from "@bloodyowl/boxed";
import type {
  Activation,
  ActivationResult,
  PendingUser,
  PersistenceError,
  UserId,
} from "../domain/types";
export type AuthPersistence = Readonly<{
  createPending: (
    input: Readonly<{
      email: string;
      emailVerifiedAt: number;
      registrationExpiresAt: number;
      tokenDigest: string;
      now: number;
    }>,
  ) => Promise<Result<PendingUser, PersistenceError>>;
  replaceProof: (
    input: Readonly<{
      userId: UserId;
      tokenDigest: string;
      emailVerifiedAt: number;
      now: number;
    }>,
  ) => Promise<Result<PendingUser, PersistenceError>>;
  activateAndIssueSession: (
    input: Activation,
  ) => Promise<Result<ActivationResult, PersistenceError>>;
}>;
