import { logFields } from "@insta/fe-core/observability/contracts";
export const identity = {
  app: "insta",
  [logFields.serviceName]: "be-insta",
  source: "server",
} as const;
export const abortedHttpStatus = 499;
export const defaultOptions = {
  mode: "runtime",
  level: "info",
  flushTimeoutMs: 1000,
} as const;
