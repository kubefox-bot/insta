import type { Readable } from "svelte/store";
import type {
  DrainSummary,
  QueueActor,
  QueuedMessage,
  QueueError,
} from "../domain/types";
import type { OutboxAuth } from "../ports/auth";
export type OutboxIssueSource =
  | "read"
  | "enqueue"
  | "confirmation"
  | "drain"
  | "logout";
export type OutboxView = Readonly<{
  ownerId: string | null;
  records: readonly QueuedMessage[];
  busy: boolean;
}> &
  (
    | Readonly<{ issue?: undefined; issueSource?: undefined }>
    | Readonly<{ issue: QueueError; issueSource: OutboxIssueSource }>
  );
export type OutboxLifecycleAuth = OutboxAuth &
  Readonly<{
    subscribe: (changed: () => void) => () => void;
    registerLogout: (
      cleanup: (actor: QueueActor | null) => Promise<void>,
    ) => () => void;
  }>;
export type OutboxChanges = Readonly<{
  publish: () => void;
  subscribe: (changed: () => void) => () => void;
  close: () => void;
}>;
export type OutboxBrowser = Readonly<{
  view: Readable<OutboxView>;
  enqueue: (
    input: Readonly<{ conversationId: string; text: string }>,
  ) => Promise<import("@bloodyowl/boxed").Result<QueuedMessage, QueueError>>;
  confirmResume: (
    operationIds: readonly string[],
  ) => Promise<import("@bloodyowl/boxed").Result<number, QueueError>>;
  wake: () => Promise<DrainSummary>;
  dispose: () => void;
}>;
export type OutboxDependencies = Readonly<{
  queue: import("../ports/queue").Queue;
  sender: import("../ports/sender").Sender;
  auth: OutboxLifecycleAuth;
  locks: import("../ports/auth").OutboxLocks;
  changes: OutboxChanges;
  clock: () => number;
  uuid: () => string;
  jitter: () => number;
}>;
export type OutboxRuntime = {
  confirmationControllers: Set<AbortController>;
  disposed: boolean;
  epoch: number;
  controller?: AbortController;
  passActor?: QueueActor | null;
  requestedWake?: boolean;
  running?: Promise<DrainSummary>;
  timer?: ReturnType<typeof setTimeout>;
};
export type OutboxProjection = Readonly<{
  view: Readable<OutboxView>;
  refresh: () => Promise<"ready" | "read-failed" | "stale">;
  clear: () => void;
  busy: (value: boolean) => void;
  issue: (
    failure: Readonly<{ code: QueueError; source: OutboxIssueSource }>,
  ) => void;
}>;
