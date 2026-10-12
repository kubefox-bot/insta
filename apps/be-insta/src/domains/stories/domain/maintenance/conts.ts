export const maintenancePolicy = {
  cleanupMs: 60_000,
  cleanupBatch: 20,
  unfinishedMs: 3_600_000,
  leaseMs: 120_000,
  reconcileMs: 300_000,
  reconcilePage: 100,
  concurrency: 4,
  shutdownMs: 15_000,
} as const;
