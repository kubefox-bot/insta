import type { ReceiptErrorCode } from "@insta/contracts/errors";
import type { ConversationError } from "../types";

export type ReceiptState = Readonly<{
  deliveredAt: number | null;
  readAt: number | null;
}>;
export type ReceiptSnapshot = ReceiptState &
  Readonly<{
    messageId: string;
    recipientId: string;
    sequence: number;
  }>;
export type ReceiptBatchSnapshot = Readonly<{
  conversationId: string;
  receipts: readonly ReceiptSnapshot[];
}>;
export type ReceiptError =
  | ConversationError
  | (
      | ReceiptErrorCode.InvalidReceiptBatch
      | ReceiptErrorCode.ReceiptsRateLimited
      | ReceiptErrorCode.ReceiptOutcomeUnknown
    );
