export const nativeConsoleMethods = [
  "log",
  "info",
  "debug",
  "warn",
  "error",
  "trace",
] as const;
export const nativeConsoleLevels = {
  log: "info",
  info: "info",
  debug: "debug",
  warn: "warn",
  error: "error",
  trace: "debug",
} as const;
