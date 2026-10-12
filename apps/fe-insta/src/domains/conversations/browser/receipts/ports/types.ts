import type { Readable } from "svelte/store";
import type { ConversationActor, Message } from "../../types";
import type {
  AcknowledgeReceiptsInput,
  ReceiptBatchWireSnapshot,
  ReceiptQueueView,
} from "../types";
export type ReceiptClock = Readonly<{
  now: () => number;
  schedule: (run: () => void, delayMs: number) => () => void;
}>;
export type ReceiptQueueDependencies = Readonly<{
  actor: ConversationActor;
  currentActor: () => ConversationActor | null;
  acknowledge: (
    input: AcknowledgeReceiptsInput,
  ) => Promise<ReceiptBatchWireSnapshot>;
  clock: ReceiptClock;
}>;
export type ReceiptQueue = Readonly<{
  view: Readable<ReceiptQueueView>;
  acceptMessages: (messages: readonly Message[]) => void;
  readVisible: (messageIds: readonly string[]) => void;
  retry: () => void;
  dispose: () => void;
}>;
