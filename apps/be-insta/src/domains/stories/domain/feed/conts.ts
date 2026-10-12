export const feedPolicy = {
  authorsPerPage: 20,
  cacheMs: 30_000,
  concurrentReads: 4,
  cursorBytes: 512,
  feedPerMinute: 60,
  playbackPerMinute: 120,
  retryAfterSeconds: 60,
} as const;
