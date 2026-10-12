import type { RealtimeErrorCode } from "@insta/contracts/realtime";
import type { SubscriptionLifecycle } from "../../../../../lib/realtime/index";
import type {
  ConversationActor,
  ConversationStore,
  Message,
  SynchronizationOutcome,
} from "../../types";
import type { RecoveryPhase } from "../subscription/types";
export type Entry = {
  readonly lifecycle: SubscriptionLifecycle;
  readonly receivers: Set<(message: Message) => void>;
  issue: RealtimeErrorCode | undefined;
  recoveryPhase: RecoveryPhase;
  recoveryGeneration: number;
  recovery: Promise<void> | null;
};
export type Dependencies = Readonly<{
  actor: ConversationActor;
  command: import("../../../../../lib/realtime/index").SubscriptionDependencies["command"];
  connected: () => boolean;
  store: Pick<
    ConversationStore,
    | "view"
    | "report"
    | "setConnection"
    | "receiveReceipts"
    | "setSubscriptionIssue"
  >;
  online: () => boolean;
  recover?: (id: string) => Promise<SynchronizationOutcome>;
}>;
export type DeliveryDependencies = Readonly<{
  entries: ReadonlyMap<string, Entry>;
  owned: () => boolean;
  actor: ConversationActor;
  store: Dependencies["store"];
  claim: (id: string, entry: Entry) => (() => void) | undefined;
  report: (id: string, entry: Entry, code: RealtimeErrorCode) => void;
}>;
export type RecoveryDependencies = Readonly<{
  id: string;
  entry: Entry;
  active: () => boolean;
  recover: Dependencies["recover"];
  report: (code: RealtimeErrorCode | undefined) => void;
}>;
