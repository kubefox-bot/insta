import type { Result } from "@bloodyowl/boxed";
import type {
  CommonErrorCode,
  DirectoryErrorCode,
} from "@insta/contracts/errors";

export type DirectoryError =
  | DirectoryErrorCode.UserNotFound
  | DirectoryErrorCode.DirectoryRateLimited
  | CommonErrorCode.DependencyUnavailable;
export type PublicUser = Readonly<{ id: string; username: string }>;
export type DirectoryQuota = Readonly<{
  consume: (
    actorId: string,
  ) => Promise<Result<"allowed" | "limited", "unavailable">>;
}>;
