import { AuthErrorCode } from "@insta/contracts/errors";
export const authHttpErrors = {
  busy: {
    status: 503,
    code: AuthErrorCode.AuthBusy,
    message: "Authentication capacity unavailable",
    retryAfterSeconds: 2,
  },
  unavailable: {
    status: 503,
    code: AuthErrorCode.AuthLimitsUnavailable,
    message: "Authentication temporarily unavailable",
    retryAfterSeconds: 2,
  },
  limited: {
    status: 429,
    code: AuthErrorCode.AuthRateLimited,
    message: "Authentication request limit reached",
  },
} as const;
