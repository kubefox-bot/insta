import type {
  ConversationRuntime,
  ConversationStore,
  UnreadSummary,
} from "../../../domains/conversations/browser/index";
import {
  type Actor,
  type AuthBrowser,
  searchDirectory,
} from "../../../domains/users/browser/index";
import type { RealtimeHost } from "../../realtime/browser/index";
import { attachConversationConnection } from "./connect";
import { createRuntimeDisposal } from "./dispose";
import { createConversationListRuntime } from "./list";
import { createConversationQueue } from "./queue";
import { createRuntimeReceipts } from "./receipts";
import { retrySelectedSubscription } from "./recovery";
import { createRuntimeResume, rejectStoryResume } from "./resume";
import { createRuntimeSession } from "./session";
import { createUnreadInvalidation } from "./unread";
/**
 * Собирает browser runtime диалогов для actor: session, outbox, receipts, список и
 * continuation; подключает realtime и private cleanup. Возвращённый dispose освобождает
 * приобретённые ресурсы, auth и store переданы вызывающим.
 */
export const createConversationRuntime = ({
  store,
  actor,
  auth,
  navigate,
  observe,
  initialHydration = false,
  onResumed,
  onRejected,
  unread,
  realtimeHost,
}: Readonly<{
  store: ConversationStore;
  actor: Actor;
  auth: AuthBrowser;
  unread?: UnreadSummary;
  realtimeHost?: RealtimeHost;
  navigate: (url: string) => Promise<void>;
  observe?: (kind: string) => void;
  initialHydration?: boolean;
  onRejected?: import("../../../domains/auth-continuation/browser/index").ResumeDependencies["onRejected"];
  onResumed?: import("../../../domains/auth-continuation/browser/index").ResumeDependencies["onResumed"];
}>): ConversationRuntime => {
  const invalidateUnread = createUnreadInvalidation({ unread, store });
  const ownership = { actor, store, auth };
  const { transport, session, connection, connectionStatus, retry } =
    createRuntimeSession({
      ...ownership,
      navigate,
      observe,
      realtimeHost,
    });
  const queue = createConversationQueue({ auth, store });
  const receipts = createRuntimeReceipts({
    ...ownership,
    onReadAcknowledged: invalidateUnread,
  });
  const list = createConversationListRuntime({
    ...ownership,
    transport,
    initialHydration,
    unread,
  });
  const unsubscribe = attachConversationConnection({
    store,
    session,
    connection,
    connectionStatus,
    connected: list.connected,
  });
  const releasePrivate = auth.registerPrivate(store.clear);
  const continuation = createRuntimeResume({
    authView: auth.view,
    openConversation: session.openTarget,
    openStory: rejectStoryResume,
    onResumed,
    onRejected,
  });
  connection.connect();
  return {
    outbox: queue.outbox,
    receipts,
    /**
     * Ищет получателя в каталоге от actor runtime, передавая сигнал отмены инициатора поиска.
     */
    search: ({ q, signal }) => searchDirectory({ q, signal, actor }),
    open: session.open,
    synchronize: session.synchronize,
    earlier: session.earlier,
    retry: () => retrySelectedSubscription({ store, retry, connection }),
    resume: continuation.resume,
    dispose: createRuntimeDisposal({
      continuation,
      unsubscribe,
      list,
      releasePrivate,
      queue,
      receipts,
      store,
      connection,
      cleanupFailed: auth.reportPrivateCleanupFailure,
    }),
  };
};
