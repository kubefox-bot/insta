export const playbackObservation = {
  readyState: 2,
  inactiveEvents: ["pause", "waiting", "ended"],
} as const;
export const horizonObservation = {
  pollMs: 50,
  millisecondsPerSecond: 1000,
} as const;
