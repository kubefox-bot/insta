import {
  AuthErrorCode,
  CommonErrorCode,
  RealtimeErrorCode,
} from "@insta/contracts/errors";
import type {
  CommandCompletion,
  RealtimeAck,
} from "../../../../lib/realtime/index";
export const outboxPollIntervalMs = 250;

export const commandCompletion = {
  success: { code: "OK", outcome: "succeeded" },
  unsupportedOperation: "ws.unsupported",
  failureOutcomes: {
    [CommonErrorCode.ValidationFailed]: "rejected",
    [CommonErrorCode.Forbidden]: "rejected",
    [AuthErrorCode.SessionRevoked]: "rejected",
    [CommonErrorCode.InternalError]: "failed",
    [RealtimeErrorCode.UnsupportedCommand]: "rejected",
    [RealtimeErrorCode.RateLimited]: "rejected",
    [RealtimeErrorCode.ServiceUnavailable]: "failed",
    [RealtimeErrorCode.ResyncRequired]: "rejected",
    [RealtimeErrorCode.ProtocolUnsupported]: "rejected",
    [RealtimeErrorCode.DeliveryBlocked]: "failed",
  } satisfies Record<
    Extract<RealtimeAck, { ok: false }>["error"]["code"],
    CommandCompletion["outcome"]
  >,
} as const;
