export const receiptRank = { none: 0, delivered: 1, read: 2 } as const;
export const receiptFlushMs = 200;
export const receiptRetryMs = {
  "0": 1000,
  "1": 2000,
  "2": 4000,
  "3": 8000,
  "4": 16000,
} as const;
export const receiptSendPriority = ["read", "delivered"] as const;
