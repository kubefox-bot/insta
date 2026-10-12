export const outboxPolicy = {
  maxBatch: 20,
  concurrency: 4,
  leaseMs: 30000,
  attemptTimeoutMs: 10000,
  retryBaseMs: 1000,
  retryMaximumMs: 60000,
} as const;
export const outboxSinks = ["realtime", "analytics"] as const;
