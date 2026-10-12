import { ReceiptErrorCode } from "@insta/contracts/errors";
export const receiptTransportCodes = {
  invalidInput: ReceiptErrorCode.InvalidReceiptBatch,
  invalidContract: "INVALID_CONTRACT",
  unknownOutcome: ReceiptErrorCode.ReceiptOutcomeUnknown,
  queueFailed: "RECEIPT_QUEUE_FAILED",
} as const;
export const receiptRateLimitedStatus = 429;
export const receiptServerFailureStatus = 500;

export const earlyReceiptPolicy = {
  maxConversations: 5,
  maxMessages: 50,
} as const;
