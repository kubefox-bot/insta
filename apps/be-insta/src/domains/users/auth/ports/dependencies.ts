import type { SessionId } from "../../domain/types";
import type { PasswordHasher } from "../../ports/password-hasher";
import type { Sessions } from "./sessions";
import type { Tokens } from "./tokens";
export type AuthDependencies = Readonly<{
  sessions: Sessions;
  tokens: Tokens;
  passwords: PasswordHasher;
  clock: () => number;
  sessionId: () => SessionId;
  operationId: () => string;
}>;
