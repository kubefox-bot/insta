export const storyPolicy = {
  activeLimit: 5,
  requestMs: 90_000,
  leaseMs: 120_000,
  heartbeatMs: 20_000,
  inspectionMs: 10_000,
  playbackMs: 300_000,
  transactionMs: 10_000,
} as const;
