import {
  usernameCharacters as allowedUsernameCharacters,
  passwordLimits as passwordInputLimits,
  usernameLimits as usernameInputLimits,
} from "@insta/contracts/auth";
export const passwordLimits = passwordInputLimits;
export const usernameCharacters = allowedUsernameCharacters;
export const usernameLimits = usernameInputLimits;
export const malformedSurrogate =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
export const durations = {
  registrationMs: 86400000,
  accessMs: 900000,
  refreshMs: 604800000,
  absoluteSessionMs: 2592000000,
  replayMs: 120000,
} as const;
export const authLimits = {
  otpEmail: { maximum: 5, windowMs: 86400000 },
  otpIp: { maximum: 20, windowMs: 3600000 },
  loginEmail: { maximum: 10, windowMs: 900000 },
  loginIp: { maximum: 50, windowMs: 900000 },
  challengeErrors: { maximum: 5 },
} as const;
export const mutationLimits = {
  otp: { email: "otpEmail", source: "otpIp" },
  login: { email: "loginEmail", source: "loginIp" },
} as const satisfies Record<
  import("./types").AuthMutation,
  Readonly<{
    email: import("./types").AuthLimit;
    source: import("./types").AuthLimit;
  }>
>;
export const passwordAdmission = {
  concurrent: 2,
  queued: 8,
  queueTimeoutMs: 2000,
  retryAfterSeconds: 2,
} as const;
