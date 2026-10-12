/**
 * Создаёт независимые pending-состояния realtime и analytics с нулевыми попытками и
 * готовностью к claim в переданный момент.
 */
export const initialDeliveries = (now: number) => ({
  realtime: {
    state: "pending" as const,
    attempts: 0,
    leaseUntil: 0,
    nextAttemptAt: now,
  },
  analytics: {
    state: "pending" as const,
    attempts: 0,
    leaseUntil: 0,
    nextAttemptAt: now,
  },
});
