import { CommonErrorCode } from "@insta/contracts/errors";
export const healthStatus = { ready: 200, unavailable: 503 } as const;
export const unavailableError = {
  code: CommonErrorCode.DependencyUnavailable,
  message: "Required dependency unavailable",
} as const;
