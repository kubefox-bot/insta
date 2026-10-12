import type {
  DeliveryPosition,
  ReplayPayload,
} from "@insta/contracts/realtime";
export type DeliveryStream = Readonly<{
  kind: "conversation" | "unread" | "stories";
  id: string;
}>;
export type DeliverySource = Readonly<{
  kind: "message" | "receipt" | "notification";
  eventId: string;
}>;
export type StoredDelivery = Readonly<
  DeliveryPosition & {
    eventId: string;
    eventType: ReplayPayload["type"];
    source: DeliverySource;
    createdAt: number;
    recordedAt: number;
    expiresAt: number;
  }
>;
export type DeliveryPayload = ReplayPayload;
export type DeliveryPage = Readonly<
  | { kind: "page"; events: readonly StoredDelivery[]; head: DeliveryPosition }
  | { kind: "resync-required" }
>;
export type SourceDeliveries = Readonly<
  { kind: "active"; events: readonly StoredDelivery[] } | { kind: "expired" }
>;

export type DeliveryRange = Readonly<
  | { kind: "range"; after: DeliveryPosition; head: DeliveryPosition }
  | { kind: "resync-required" }
>;

export type MaterializedDelivery = StoredDelivery &
  Readonly<{ payload: DeliveryPayload }>;
export type DeliveryLease = Readonly<{
  stream: DeliveryStream;
  generation: string;
  token: string;
}>;
export type StreamsPage = Readonly<
  | {
      kind: "page";
      events: readonly MaterializedDelivery[];
      head: DeliveryPosition;
    }
  | { kind: "gap" }
>;
export type StreamNotice = Readonly<{
  kind: "available" | "generation-changed" | "integrity-lost";
}>;
export type StreamsState = Readonly<
  | {
      kind: "ready";
      after: DeliveryPosition;
      head: DeliveryPosition;
      generation: string;
    }
  | { kind: "gap" }
>;
export type PublicationOutcome = undefined | Readonly<{ kind: "expired" }>;

export type DeliveryAdmissionCode =
  | import("@insta/contracts/errors").AuthErrorCode.SessionRevoked
  | import("@insta/contracts/errors").CommonErrorCode.Forbidden
  | import("@insta/contracts/realtime").RealtimeErrorCode.ResyncRequired;
export type DeliveryAccess = Readonly<{
  authorize: import("../realtime").DeliveryAuthorization;
  membership: import("../realtime").Membership;
  clock: () => number;
}>;
export type DeliveryAdmissionPorts = DeliveryAccess &
  Readonly<{
    journal: Pick<import("./interfaces").DeliveryJournal, "head" | "range">;
    uuid: () => string;
  }>;
export type DeliverySelection = Readonly<{
  actor: import("../../../users/index").Actor;
  target: DeliveryStream;
  signal: AbortSignal;
}>;
export type DeliveryInFlight = Omit<DeliverySelection, "signal"> &
  Readonly<{
    attempt: import("../../domain/delivery/types").DeliveryAttempt;
    failures: number;
    retries: number;
  }>;
export type DeliverySendPorts = DeliveryAccess &
  Readonly<{
    target: Pick<import("./interfaces").DeliveryTarget, "send">;
    policy: import("../../domain/delivery/types").RetryPolicy;
    random: () => number;
  }>;
export type DeliveryRuntimePorts = DeliveryAccess &
  Readonly<{
    policy: import("../../domain/delivery/types").DeliveryPolicy;
    random: () => number;
    target: import("./interfaces").DeliveryTarget;
    streams: Pick<import("./interfaces").DeliveryStreams, "read" | "watch">;
    recover: (
      input: Readonly<{ after: DeliveryPosition; signal: AbortSignal }>,
    ) => Promise<"ready" | "resync-required">;
    wait: (
      input: Readonly<{ delayMs: number; signal: AbortSignal }>,
    ) => Promise<void>;
  }>;
