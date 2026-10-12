export type HorizonDependencies = Readonly<{
  media: EventTarget &
    Pick<
      HTMLVideoElement,
      "currentTime" | "paused" | "ended" | "pause" | "removeAttribute" | "load"
    >;
  durationMs: number;
  isCurrent: () => boolean;
  onProgress: (fraction: number) => void;
  onEnded: () => void;
  onPrepared: () => void;
  onError: () => void;
  onRelease?: () => void;
  timers?: Readonly<{
    setTimeout: (callback: () => void, delayMs: number) => unknown;
    clearTimeout: (timer: unknown) => void;
  }>;
}>;
