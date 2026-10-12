export const intakePolicy = {
  payloadBytes: 16_384,
  batchEvents: 20,
  requestsPerMinute: 60,
  rateWindowMs: 60_000,
  maximumSources: 1024,
  claimLifetimeMs: 86_400_000,
  maximumClaims: 256,
  requestTimeoutMs: 5000,
} as const;
export const clientOperations = {
  error: "frontend.error",
  ui: "frontend.ui",
  realtime: "realtime.connection",
  http: "http.client",
  storyPlayback: "story.play",
} as const;
export const faroValues = {
  appName: "fe-insta",
  errorType: "Error",
  unhandledError: "UNHANDLED_ERROR",
  webVitals: "web-vitals",
} as const;
export const clientCodes = {
  [clientOperations.error]: [faroValues.unhandledError],
  [clientOperations.ui]: ["UI_EFFECT_FAILED"],
  [clientOperations.realtime]: ["CONNECTED", "DISCONNECTED"],
  [clientOperations.http]: ["NETWORK_UNAVAILABLE"],
  [clientOperations.storyPlayback]: ["PLAYING"],
} as const;
export const measurementNames = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const;
export const faroEndpoint = "/api/telemetry/faro";
export const clientEndpoint = "/api/telemetry";

export const measurementMaximum = 60_000;
export const measurementKeys = { fcp: "FCP" } as const;
export const intakeStatus = {
  accepted: 204,
  invalid: 400,
  denied: 403,
  rateLimited: 429,
  unavailable: 503,
  tooLarge: 413,
} as const;
export const faroTransport = {
  name: "insta:sanitized-same-origin",
  version: "1",
} as const;
export const faroProtocol = "faro-json-v1";
