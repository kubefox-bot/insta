import type { Result } from "@bloodyowl/boxed";
import type { SupportError } from "../domain/types";
export type Proof = Readonly<{
  issue: (
    input: Readonly<{ contextId: string; now: number; expiresAt: number }>,
  ) => Promise<string>;
  verify: (
    input: Readonly<{ proof: string; now: number }>,
  ) => Promise<Result<string, SupportError>>;
}>;
