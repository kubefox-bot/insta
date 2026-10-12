import type { Result } from "@bloodyowl/boxed";
import type {
  PendingUser,
  PersistenceError,
  UserId,
} from "../../../domain/types";
export type RegistrationPersistence = Readonly<{
  deadline: (
    input: Readonly<{ email: string; now: number }>,
  ) => Promise<number | null>;
  confirmEmail: (
    input: Readonly<{
      email: string;
      tokenDigest: string;
      registrationExpiresAt: number;
      now: number;
    }>,
  ) => Promise<
    Result<PendingUser | Readonly<{ status: "active" }>, PersistenceError>
  >;
  expired: (now: number) => Promise<readonly UserId[]>;
  cleanup: (
    input: Readonly<{ userId: UserId; now: number }>,
  ) => Promise<number>;
}>;
