import type { Result } from "@bloodyowl/boxed";
import type {
  Challenge,
  RegistrationError,
} from "../../domain/registration/types";
export type StoredChallenge = Challenge &
  Readonly<{ codeDigest: string; ciphertext: string; revision: number }>;
export type Challenges = Readonly<{
  read: (challengeId: string) => Promise<StoredChallenge | null>;
  enqueue: (
    input: Readonly<{
      expected: StoredChallenge | null;
      challenge: StoredChallenge;
      operationId: string;
      mailPayload: string;
      now: number;
    }>,
  ) => Promise<Result<Challenge, RegistrationError>>;
  verify: (
    input: Readonly<{
      expected: StoredChallenge;
      matches: boolean;
      now: number;
    }>,
  ) => Promise<Result<string, RegistrationError>>;
}>;
