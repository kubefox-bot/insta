import type { Result } from "@bloodyowl/boxed";
import type {
  ReceiptBatchSnapshot,
  ReceiptError,
} from "../domain/receipts/types";
import type { ReadQuota } from "./quota/types";
export type ReceiptInput = Readonly<{
  actorId: string;
  conversationId: string;
  messageIds: readonly string[];
  status: "delivered" | "read";
  signal?: AbortSignal;
}>;
/** Validate membership and every message against transactional facts before any
 * effects; persist the complete batch and its changed-state event atomically. */
export type CommitReceipts = (
  input: ReceiptInput & Readonly<{ nowMs: number }>,
) => Promise<Result<ReceiptBatchSnapshot, ReceiptError>>;
export type ReadReceipts = (
  input: Omit<ReceiptInput, "status">,
) => Promise<Result<ReceiptBatchSnapshot, ReceiptError>>;
export type ReceiptDependencies = Readonly<{
  commitReceipts: CommitReceipts;
  quota: ReadQuota;
  clock: () => number;
}>;
