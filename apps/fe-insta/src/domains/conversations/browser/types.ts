import type { messageSchema } from "@insta/contracts/messages";
import type { Readable } from "svelte/store";
import type { z } from "zod";
import type { historySchema } from "../contracts/schema";
import type { conversationConnectionStates, historyStates } from "./conts";
export type Message = z.infer<typeof messageSchema>;
export type History = Readonly<
  Omit<z.output<typeof historySchema>, "items" | "pageInfo">
> &
  Readonly<{
    items: readonly z.output<typeof historySchema>["items"][number][];
    pageInfo: Readonly<z.output<typeof historySchema>["pageInfo"]>;
  }>;
export type HistoryQuery = Readonly<{
  conversationId: string;
  after?: number;
  limit?: number;
  cursor?: string;
}>;
export type HistorySubscription = (() => void | Promise<void>) &
  Readonly<{ activate?: () => Promise<void> }>;
export type SynchronizationOutcome = Readonly<{
  kind: "applied" | "stale" | "failed";
}>;
export type SyncDependencies = Readonly<{
  subscribe: (
    id: string,
    receive: (message: Message) => void,
    options?: Readonly<{ onReserved: (release: HistorySubscription) => void }>,
  ) => Promise<HistorySubscription>;
  history: (query: HistoryQuery) => Promise<History>;
  onLive?: (message: Message) => void;
  merge: (
    input: Readonly<{
      current: readonly Message[];
      incoming: readonly Message[];
    }>,
  ) => readonly Message[];
}>;
export type SyncResult = Readonly<{
  items: readonly Message[];
  verifiedCursor: number;
  earlierCursor: string | null;
  release: HistorySubscription;
}>;
export type Conversation = z.infer<
  typeof import("../contracts/schema").conversationSchema
>;
export type ConversationActor = Readonly<{
  userId: string;
  generation: string;
}>;
export type CachedHistory = Readonly<{
  items: readonly Message[];
  verifiedCursor: number;
  earlierCursor: string | null;
  status: (typeof historyStates)[keyof typeof historyStates];
  issue?: string;
  deliveryIssue?: import("@insta/contracts/realtime").RealtimeErrorCode;
}>;
export type ConversationView = Readonly<{
  actor: ConversationActor | null;
  conversations: readonly Conversation[];
  selectedId: string | null;
  histories: ReadonlyMap<string, CachedHistory>;
  connection: (typeof conversationConnectionStates)[keyof typeof conversationConnectionStates];
  connectionIssue?: import("@insta/contracts/realtime").RealtimeErrorCode;
  issue?: string;
}>;
export type ConversationStore = Readonly<{
  view: import("svelte/store").Readable<ConversationView>;
  applyList: (
    input: Readonly<{
      actor: ConversationActor;
      conversations: readonly Conversation[];
    }>,
  ) => void;
  synchronizeList: (
    input: Readonly<{ actor: ConversationActor; signal: AbortSignal }>,
    load: () => Promise<readonly Conversation[]>,
  ) => Promise<void>;
  hydrate: (
    input: Readonly<{
      actor: ConversationActor;
      conversationId: string;
      history: History;
    }>,
  ) => void;
  select: (id: string | null) => void;
  reconcileActor: (actor: ConversationActor | null) => void;
  receive: (message: Message, actor: ConversationActor) => void;
  receiveReceipts: (
    snapshot: import("./receipts/types").ReceiptBatchWireSnapshot,
    actor: ConversationActor,
  ) => import("./receipts/types").ReceiveReceiptsOutcome;
  setConnection: (
    connection: ConversationView["connection"],
    issue?: import("@insta/contracts/realtime").RealtimeErrorCode,
  ) => void;
  report: (issue: string) => void;
  setSubscriptionIssue: (
    id: string,
    code: import("@insta/contracts/realtime").RealtimeErrorCode | undefined,
  ) => void;
  synchronize: (
    input: Readonly<{ conversationId: string; actor: ConversationActor }>,
    dependencies: SyncDependencies,
  ) => Promise<SynchronizationOutcome>;
  earlier: (
    input: Readonly<{ conversationId: string; actor: ConversationActor }>,
    history: (query: HistoryQuery) => Promise<History>,
  ) => Promise<void>;
  addConversation: (
    conversation: Conversation,
    actor: ConversationActor,
  ) => void;
  clear: () => void;
}>;
export type ConversationRuntime = Readonly<{
  receipts: ReturnType<
    typeof import("./receipts/lifecycle").mountReceiptAcknowledgments
  >;
  outbox: import("./outbox/index").OutboxBrowser;
  search: (
    input: Readonly<{ q: string; signal: AbortSignal }>,
  ) => Promise<readonly Readonly<{ id: string; username: string }>[]>;
  open: (recipientId: string) => Promise<void>;
  synchronize: (id: string) => Promise<SynchronizationOutcome>;
  earlier: (id: string) => Promise<void>;
  resume: (input: Readonly<{ intentId: string }>) => Promise<boolean>;
  dispose: () => void;
  retry: () => void;
}>;
export type ConversationContext = Readonly<{
  scroll?: ReturnType<
    typeof import("./scroll/create").createConversationScroll
  >;
  directoryNames?: Readable<ReadonlyMap<string, string>>;
  store: ConversationStore;
  drafts: ReturnType<typeof import("./drafts/create").createConversationDrafts>;
  runtime: () => ConversationRuntime | null;
}>;

export type ConversationHttp = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
