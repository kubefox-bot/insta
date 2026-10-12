import { SupportErrorCode } from "@insta/contracts/errors";
export const supportDependenciesToken = "SUPPORT_REPORTS_DEPENDENCIES";
export const supportStatus = {
  [SupportErrorCode.SupportUnavailable]: 503,
  [SupportErrorCode.SupportContextInvalid]: 403,
  [SupportErrorCode.SupportIdentityUnavailable]: 503,
  [SupportErrorCode.SupportConflict]: 409,
  [SupportErrorCode.SupportRateLimited]: 429,
} as const;
