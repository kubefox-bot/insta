import type { ReceiptBatchSnapshot } from "../domain/receipts/types";
import type { PublicationOutcome } from "./delivery/types";
export type ReceiptEvent = ReceiptBatchSnapshot &
  Readonly<{ eventId: string; createdAt: number }>;
export type ReceiptClaim = Readonly<{
  event: ReceiptEvent;
  leaseId: string;
  attempts: number;
}>;
export type ReceiptOutbox = Readonly<{
  claim: (
    input: Readonly<{ now: number; leaseId: string }>,
  ) => Promise<ReceiptClaim | null>;
  complete: (
    input: ReceiptClaim & Readonly<{ now: number }>,
  ) => Promise<boolean>;
  expire?: (
    input: ReceiptClaim & Readonly<{ now: number }>,
  ) => Promise<boolean>;
  fail: (
    input: ReceiptClaim & Readonly<{ nextAttemptAt: number }>,
  ) => Promise<boolean>;
}>;
/** Settlement confirms publication I/O and cleanup; cancellation alone is not settlement. */
export type ReceiptSink = (
  input: Readonly<{ event: ReceiptEvent; signal: AbortSignal }>,
) => Promise<void> | Promise<PublicationOutcome>;
