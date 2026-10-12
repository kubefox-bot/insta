import type { Result } from "@bloodyowl/boxed";
import type {
  CommonErrorCode,
  DirectoryErrorCode,
} from "@insta/contracts/errors";
export type Directory = Readonly<{
  findPublicUser: (
    input: Readonly<{ id: string }>,
  ) => Promise<
    Result<
      Readonly<{ id: string; username: string }>,
      | DirectoryErrorCode.UserNotFound
      | DirectoryErrorCode.DirectoryRateLimited
      | CommonErrorCode.DependencyUnavailable
    >
  >;
}>;
