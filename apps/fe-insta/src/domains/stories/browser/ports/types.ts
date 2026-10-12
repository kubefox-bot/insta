import type { FeedPage } from "../../domain/feed/types";
export type StoryClock = Readonly<{
  now: () => number;
  schedule: (operation: () => void, delayMs: number) => () => void;
}>;
export type FeedReader = (
  input: Readonly<{
    cursor: string | null;
    signal: AbortSignal;
  }>,
) => Promise<FeedPage>;
export type Playback = Readonly<{ url: string; expiresAt: number }>;
export type PlaybackReader = (
  input: Readonly<{
    id: string;
    signal: AbortSignal;
  }>,
) => Promise<Playback>;
export type StoryPreloader = Readonly<{
  saveData: () => boolean;
  prepare: (url: string) => () => void;
}>;
