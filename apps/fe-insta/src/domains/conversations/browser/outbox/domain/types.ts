import type { queueErrors } from "./conts";
export type QueuedMessage = Readonly<{
  ownerId: string;
  conversationId: string;
  text: string;
  key: string;
  clientMessageId: string;
  operationId: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastAuthGeneration: string;
  revision: number;
  manualAttempt: boolean;
}> &
  (
    | Readonly<{ state: "queued"; needsConfirmation: false }>
    | Readonly<{ state: "confirmation"; needsConfirmation: true }>
    | Readonly<{
        state: "terminal";
        needsConfirmation: false;
        errorCode: string;
      }>
  );
export type QueueError = (typeof queueErrors)[keyof typeof queueErrors];
export type SendOutcome =
  | Readonly<{ kind: "confirmed"; messageId: string }>
  | Readonly<{ kind: "unknown" }>
  | Readonly<{ kind: "retry"; retryAfterMs?: number }>
  | Readonly<{ kind: "terminal"; code: string }>
  | Readonly<{ kind: "auth" }>;
export type DrainSummary = Readonly<{
  sent: number;
  confirmed: number;
  needsConfirmation: number;
  issue?: QueueError;
  nextAttemptAt?: number;
}>;
export type QueueActor = Readonly<{ ownerId: string; generation: string }>;
