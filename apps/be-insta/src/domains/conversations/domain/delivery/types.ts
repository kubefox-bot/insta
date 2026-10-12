import type {
  DeliveryAck,
  DeliveryReply,
  DeliveryUnit,
} from "@insta/contracts/realtime";

export type DeliveryPolicy = Readonly<{
  retentionMs: number;
  ackTimeoutMs: number;
  replayPageSize: number;
  maxUnreadBatchSize: number;
  maxApplyFailures: number;
  deliveryRetryBaseMs: number;
  deliveryRetryCapMs: number;
  maxSubscriptionsPerSocket: number;
}>;
export type RetryPolicy = Pick<
  DeliveryPolicy,
  "maxApplyFailures" | "deliveryRetryBaseMs" | "deliveryRetryCapMs"
>;
export type SendOutcome =
  | DeliveryReply
  | Readonly<{ kind: "timeout" | "invalid" | "closed" }>;
export type DeliveryStep = Readonly<
  | { kind: "acked"; failures: number; retries: number }
  | { kind: "retry"; failures: number; retries: number; delayMs: number }
  | { kind: "blocked"; failures: number }
  | { kind: "resync-required" | "unauthorized" | "closed" }
>;
export type DeliveryAttempt = Readonly<{
  unit: DeliveryUnit;
  expected: DeliveryAck;
  expiresAt: number;
}>;
export type TransitionInput = Readonly<{
  expected: DeliveryAck;
  reply: SendOutcome;
  failures: number;
  retries: number;
  nowMs: number;
  expiresAt: number;
  random: number;
  policy: RetryPolicy;
}>;
