import type {
  DeliveryNotice,
  DeliveryPosition,
  DeliveryReply,
  DeliveryUnit,
} from "@insta/contracts/realtime";
export type ApplyOutcome =
  | "applied"
  | "stale"
  | Readonly<{
      kind: "retry-later";
      retryAfterMs?: number;
      afterReply?: () => void;
    }>
  | Readonly<{ kind: "apply-failed" }>;
export type DeliveryResult = Readonly<{
  reply: DeliveryReply;
  afterReply?: () => void;
  current?: () => boolean;
}>;
export type NoticeResult = Readonly<{
  receipt: DeliveryNotice;
  afterReply?: () => void;
  current?: () => boolean;
}>;
export type DeliveryReceiver = Readonly<{
  receive: (
    unit: DeliveryUnit,
    active: () => boolean,
  ) => Promise<DeliveryResult | null>;
  notice: (
    notice: DeliveryNotice,
    active: () => boolean,
  ) => NoticeResult | null;
}>;
export type DeliveryCursor = Readonly<DeliveryPosition>;
