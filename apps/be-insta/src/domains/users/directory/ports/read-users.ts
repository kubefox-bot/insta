import type { Result } from "@bloodyowl/boxed";
import type { DirectoryError, PublicUser } from "../domain/types";
export type ReadUsers = Readonly<{
  findActive: (
    input: Readonly<{ id: string }>,
  ) => Promise<Result<PublicUser, DirectoryError>>;
  searchActive: (
    input: Readonly<{ query: string; limit: number }>,
  ) => Promise<Result<ReadonlyArray<PublicUser>, DirectoryError>>;
}>;
