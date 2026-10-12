import type { QueuedMessage } from "../../../domain/types";
import type { OutboxAuth } from "../../../ports/auth";
import type { Queue } from "../../../ports/queue";
import type { Sender } from "../../../ports/sender";
export type AttemptContext = Readonly<{
  record: QueuedMessage;
  manualAttempt: boolean;
}>;
export type PassInput = Readonly<{
  ownerId: string;
  authGeneration: string;
  now: number;
}>;
export type PassDependencies = Readonly<{
  queue: Queue;
  sender: Sender;
  auth: OutboxAuth;
  jitter: () => number;
  clock?: () => number;
  signal?: AbortSignal;
}>;

export type LockedOutcome =
  | Readonly<{
      kind: "finished";
      summary: import("../../../domain/types").DrainSummary;
    }>
  | Readonly<{
      kind: "attempted";
      attempt: AttemptContext;
      outcome: import("../../../domain/types").SendOutcome;
      confirmations: number;
    }>;
