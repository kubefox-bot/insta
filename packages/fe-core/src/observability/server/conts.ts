export const defaultFlushTimeoutMs = 1000;
export const traceScopeName = "insta.operations";
export const safePinoRedactionPaths = [
  "password",
  "hash",
  "otp",
  "cookie",
  "token",
  "ticket",
  "email",
  "text",
  "headers",
  "req",
  "res",
  "*.password",
  "*.token",
  "*.cookie",
] as const;
export const nativeLevelNames = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;
export const nativeLevels = {
  trace: "debug",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "error",
} as const;
