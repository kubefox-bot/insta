export const realtimeDefaults = {
  retentionMs: 86_400_000,
  ackTimeoutMs: 5000,
  replayPageSize: 64,
  maxUnreadBatchSize: 64,
  maxApplyFailures: 5,
  deliveryRetryBaseMs: 1000,
  deliveryRetryCapMs: 30_000,
  maxSubscriptionsPerSocket: 6,
} as const;
export const realtimeConfigLimits = {
  maxTimerDelayMs: 2_147_483_647,
  maximumDateMs: 8_640_000_000_000_000,
  maxReplayPageSize: 1024,
  maxApplyFailures: 1000,
  maxSubscriptionsPerSocket: 1024,
} as const;
export const realtimeEnvironmentKeys = {
  retentionMs: "REALTIME_RETENTION_MS",
  ackTimeoutMs: "REALTIME_ACK_TIMEOUT_MS",
  replayPageSize: "REALTIME_REPLAY_PAGE_SIZE",
  maxUnreadBatchSize: "REALTIME_MAX_UNREAD_BATCH_SIZE",
  maxApplyFailures: "REALTIME_MAX_APPLY_FAILURES",
  deliveryRetryBaseMs: "REALTIME_DELIVERY_RETRY_BASE_MS",
  deliveryRetryCapMs: "REALTIME_DELIVERY_RETRY_CAP_MS",
  maxSubscriptionsPerSocket: "REALTIME_MAX_SUBSCRIPTIONS_PER_SOCKET",
} as const satisfies Record<keyof typeof realtimeDefaults, string>;
