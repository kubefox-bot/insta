import { CommonErrorCode, DirectoryErrorCode } from "@insta/contracts/errors";
export const directoryDependenciesToken = "DIRECTORY_DEPENDENCIES";
export const directoryErrorStatus = {
  [DirectoryErrorCode.UserNotFound]: 404,
  [DirectoryErrorCode.DirectoryRateLimited]: 429,
  [CommonErrorCode.DependencyUnavailable]: 503,
} as const satisfies Record<DirectoryError, number>;
export const retryAfterSeconds = 60;

import type { DirectoryError } from "../../domain/types";
