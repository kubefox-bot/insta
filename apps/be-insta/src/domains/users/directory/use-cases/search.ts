import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, DirectoryErrorCode } from "@insta/contracts/errors";
import type { Actor } from "../../auth/domain/types";
import type {
  DirectoryError,
  DirectoryQuota,
  PublicUser,
} from "../domain/types";
import type { ReadUsers } from "../ports/read-users";
/**
 * Расходует квоту actor перед чтением каталога; различает недоступность квоты и rate
 * limit, поиск выполняет только при разрешении.
 */
export const searchUsers = async (
  input: Readonly<{ actor: Actor; query: string; limit: number }>,
  dependencies: Readonly<{ users: ReadUsers; quota: DirectoryQuota }>,
): Promise<Result<ReadonlyArray<PublicUser>, DirectoryError>> => {
  const admission = await dependencies.quota.consume(input.actor.userId);
  if (admission.isError())
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  if (admission.get() === "limited")
    return Result.Error(DirectoryErrorCode.DirectoryRateLimited);
  return dependencies.users.searchActive(input);
};
