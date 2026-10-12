import type {
  ConversationActor,
  UnreadSummary,
} from "../../../domains/conversations/browser/index";
import type { AuthBrowser } from "../../../domains/users/browser/index";
import type {
  createConnection,
  DeliveryReceiver,
  EventHandlers,
} from "../../../lib/realtime/index";
import type { createApplicationRealtime } from "./create";
export type RealtimeConnection = ReturnType<typeof createConnection>;
export type RealtimeHostDependencies = Readonly<{
  auth: AuthBrowser;
  refreshStories?: () => Promise<"applied" | "retry-later" | "stale">;
  unread: UnreadSummary;
  create: typeof createApplicationRealtime;
  origin: () => string;
  uuid: () => string;
  observe?: (kind: string) => void;
}>;
export type RealtimeBorrower = Readonly<{
  actor: ConversationActor;
  handlers: EventHandlers;
  delivery?: DeliveryReceiver;
  onGenerationLost: () => void;
}>;
export type RealtimeHost = Readonly<{
  retryUnread: () => void;
  mount: (
    targets: Readonly<{
      window: Pick<Window, "addEventListener" | "removeEventListener">;
      visibility: Pick<
        Document,
        "addEventListener" | "removeEventListener" | "visibilityState"
      >;
    }>,
  ) => () => void;
  borrow: (options: RealtimeBorrower) => RealtimeConnection;
}>;
