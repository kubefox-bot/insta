export type StoryJobTimers = Readonly<{
  every: (callback: () => void, ms: number) => () => void;
  after: (callback: () => void, ms: number) => () => void;
}>;
export type StoryJobsInput = Readonly<{
  cleanup: (signal: AbortSignal) => Promise<unknown>;
  reconcile: (signal: AbortSignal) => Promise<unknown>;
  invalidate: (signal: AbortSignal) => Promise<unknown>;
  timers?: StoryJobTimers;
}>;
