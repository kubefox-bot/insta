import type { Result } from "@bloodyowl/boxed";
import type { AccessClaims, AuthError } from "../domain/types";
export type Tokens = Readonly<{
  secret: () => string;
  digest: (input: Readonly<{ secret: string }>) => string;
  matches: (input: Readonly<{ secret: string; digest: string }>) => boolean;
  issueAccess: (
    input: Readonly<{
      userId: string;
      backendSessionId: string;
      now: number;
      accessExpiresAt: number;
    }>,
  ) => Promise<string>;
  verifyAccess: (
    input: Readonly<{ accessToken: string; now: number }>,
  ) => Promise<Result<AccessClaims, AuthError>>;
  seal: (input: Readonly<{ value: string }>) => Promise<string>;
  open: (input: Readonly<{ ciphertext: string }>) => Promise<string>;
}>;
