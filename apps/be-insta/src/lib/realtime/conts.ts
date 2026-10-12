import { realtimePath } from "@insta/contracts/realtime";
export const realtimePolicy = {
  path: realtimePath,
  maxPayloadBytes: 24576,
  commandsPerMinute: 60,
  socketsPerSession: 5,
  pingIntervalMs: 25_000,
  pingTimeoutMs: 20_000,
  authorizationTimeoutMs: 2_000,
  sessionCheckIntervalMs: 1_000,
} as const;

export const commandObservation = {
  spanName: "ws.command",
  eventType: "business_operation",
  authority: "server_canonical",
  failure: { code: "WS_COMMAND_FAILED", outcome: "failed" },
  levels: { succeeded: "info", rejected: "info", failed: "error" },
} as const;
