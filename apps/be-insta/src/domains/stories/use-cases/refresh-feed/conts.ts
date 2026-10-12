export const publicationFeedPolicy = {
  timeoutMs: 1000,
  maxPendingOperations: 32,
  maxRefreshedOperations: 1024,
  refreshedTtlMs: 86_400_000,
} as const;
