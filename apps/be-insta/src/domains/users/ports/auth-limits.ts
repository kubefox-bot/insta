import type { Result } from "@bloodyowl/boxed";
import type { AuthLimit, LimitOutcome } from "../domain/types";
export type AuthLimits = Readonly<{
  consume: (
    input: Readonly<{ limit: AuthLimit; subject: string }>,
  ) => Promise<Result<LimitOutcome, "unavailable">>;
  recordChallengeError: (
    input: Readonly<{ challengeId: string; expiresAt: number; now: number }>,
  ) => Promise<Result<LimitOutcome, "unavailable">>;
}>;
