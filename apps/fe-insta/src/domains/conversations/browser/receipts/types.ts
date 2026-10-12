import type {
  receiptBatchSchema,
  receiptBatchSnapshotSchema,
  receiptSnapshotSchema,
  receiptStateSchema,
} from "@insta/contracts/messages";
import type { z } from "zod";
export type ReceiptWireSnapshot = z.infer<typeof receiptSnapshotSchema>;
export type ReceiptBatchWireSnapshot = z.infer<
  typeof receiptBatchSnapshotSchema
>;
export type ReceiptWireState = z.infer<typeof receiptStateSchema>;
export type ReceiptSnapshotEntry = Readonly<{
  sequence: number;
  recipientId?: string;
  receipt?: ReceiptWireState;
}>;
export type ReceiptSnapshotOutcome =
  | Readonly<{ kind: "applied" }>
  | Readonly<{ kind: "resync-required"; conversationId: string }>;
export type ReceiveReceiptsOutcome =
  | ReceiptSnapshotOutcome
  | Readonly<{ kind: "stale" }>;
export type AcknowledgeReceiptsInput = Readonly<{
  conversationId: string;
  messageIds: readonly string[];
  status: z.infer<typeof receiptBatchSchema>["status"];
  signal: AbortSignal;
}>;

export type ReceiptRequest = Readonly<{
  conversationId: string;
  messageIds: readonly string[];
  status: "delivered" | "read";
}>;
export type ReceiptQueueError = ReceiptRequest &
  Readonly<{
    kind: "retry" | "terminal";
    code: string;
  }>;
export type ReceiptQueueView = Readonly<{
  errors: readonly ReceiptQueueError[];
  issue?: string;
}>;
export type ReceiptFailure = Readonly<{
  kind: "retry" | "terminal";
  code: string;
  retryAfterMs?: number;
}>;
export type ReceiptAttempt =
  | ReceiptFailure
  | Readonly<{ kind: "confirmed"; snapshot: ReceiptBatchWireSnapshot }>;
