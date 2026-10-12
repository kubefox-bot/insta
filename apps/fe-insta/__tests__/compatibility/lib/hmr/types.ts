export type ObservationOptions = {
  /** Transfers socket cleanup ownership to the observation. */
  readonly socket: EventTarget & { close(): void };
  readonly change: () => Promise<void>;
  readonly timeoutMs: number;
};
