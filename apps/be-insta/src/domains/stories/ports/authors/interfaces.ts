import type { Result } from "@bloodyowl/boxed";
import type {
  CommonErrorCode,
  DirectoryErrorCode,
} from "@insta/contracts/errors";
import type { PublicAuthor } from "../../domain/types";
export interface StoryAuthors {
  readonly findPublicUser: (
    input: Readonly<{ id: string }>,
  ) => Promise<
    Result<
      PublicAuthor,
      | DirectoryErrorCode.UserNotFound
      | DirectoryErrorCode.DirectoryRateLimited
      | CommonErrorCode.DependencyUnavailable
    >
  >;
}
