import type { RealtimeErrorCode } from "@insta/contracts/errors";
import { codes } from "@insta/contracts/errors";
import { realtimePath } from "@insta/contracts/realtime";
import type { messages } from "../i18n/index";
export const connectionPolicy = {
  path: realtimePath,
  retryBaseMs: 1000,
  retryCapMs: 30000,
  retryExponentLimit: 30,
  cleanupAckTimeoutMs: 10000,
  ackTimeoutMs: 5000,
  connectionTimeoutMs: 5000,
} as const;
export const unauthorizedStatus = 401;

export const connectionStates = {
  idle: "idle",
  connecting: "connecting",
  connected: "connected",
  degraded: "degraded",
  exhausted: "exhausted",
  protocolError: "protocol-error",
  unauthorized: "unauthorized",
  disposed: "disposed",
} as const;

export const realtimeErrorKeys = {
  [codes.realtime.UnsupportedCommand]: "unexpected",
  [codes.realtime.RateLimited]: "rateLimited",
  [codes.realtime.ServiceUnavailable]: "unavailable",
  [codes.realtime.ResyncRequired]: "resyncRequired",
  [codes.realtime.ProtocolUnsupported]: "protocolUnsupported",
  [codes.realtime.DeliveryBlocked]: "deliveryBlocked",
} as const satisfies Record<
  RealtimeErrorCode,
  keyof (typeof messages)["en"]["errors"]
>;
