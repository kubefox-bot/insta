export const registrationQueue = {
  stream: "users:registration:mail",
  group: "registration-mail-v1",
  reclaimMs: 30000,
  pollMs: 250,
  attempts: 5,
  cleanupIntervalMs: 60000,
  retireScanCount: 100,
} as const;
