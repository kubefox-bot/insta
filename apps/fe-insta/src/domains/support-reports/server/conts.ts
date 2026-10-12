import {
  CommonErrorCode,
  SessionErrorCode,
  SupportErrorCode,
} from "@insta/contracts/errors";
export const supportCookie = {
  name: "insta_support",
  audience: "insta/support/v1",
  maxAgeSeconds: 86400,
  algorithm: "dir",
  encryption: "A256GCM",
  millisecondsPerSecond: 1000,
} as const;
export const supportWebStatus = {
  [SupportErrorCode.SupportUnavailable]: 503,
  [SupportErrorCode.SupportContextInvalid]: 403,
  [SupportErrorCode.SupportIdentityUnavailable]: 503,
  [SessionErrorCode.ActorChanged]: 409,
  [CommonErrorCode.ValidationFailed]: 400,
  [CommonErrorCode.Forbidden]: 403,
} as const;
