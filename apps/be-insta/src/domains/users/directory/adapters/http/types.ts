import type { DirectoryQuota } from "../../domain/types";
import type { ReadUsers } from "../../ports/read-users";
export type DirectoryDependencies = Readonly<{
  users: ReadUsers;
  quota: DirectoryQuota;
}>;
