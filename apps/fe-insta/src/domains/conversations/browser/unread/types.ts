import type { RealtimeErrorCode } from "@insta/contracts/realtime";
import type { Readable } from "svelte/store";
import type { createConnection } from "../../../../lib/realtime/index";
import type { Conversation, ConversationActor } from "../types";
export type UnreadList = Readonly<{
  items: readonly Conversation[];
  totalUnreadCount?: number;
}>;
export type UnreadDependencies = Readonly<{
  load: (actor: ConversationActor, signal: AbortSignal) => Promise<UnreadList>;
  visible: () => boolean;
}>;
export type UnreadSubscriptionDependencies = Readonly<{
  command: ReturnType<typeof createConnection>["command"];
  unread: UnreadSummary;
  uuid: () => string;
  onUnauthorized?: () => void;
}>;
export type UnreadSummaryView = Readonly<{
  actor: ConversationActor | null;
  list: UnreadList | null;
  stale: boolean;
  issue?: RealtimeErrorCode;
}>;
export type UnreadSummary = Readonly<{
  view: Readable<UnreadSummaryView>;
  reconcileActor: (actor: ConversationActor | null) => void;
  seed: (actor: ConversationActor, list: UnreadList) => void;
  refresh: () => Promise<void>;
  refreshForDelivery: (
    input: Readonly<{ signal: AbortSignal }>,
  ) => Promise<UnreadRefreshOutcome>;
  reportDeliveryIssue: (code: RealtimeErrorCode | undefined) => void;
  invalidate: () => Promise<void>;
  connected: () => Promise<void>;
  suspend: () => void;
  clear: () => void;
  reportUnavailable: () => void;
  dispose: () => void;
}>;

export type UnreadRefreshOutcome =
  | Readonly<{ kind: "applied" | "unauthorized" | "stale" | "apply-failed" }>
  | Readonly<{ kind: "retry-later"; retryAfterMs?: number }>;
