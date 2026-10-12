import type { Readable } from "svelte/store";
import type { FeedGroup, FeedSnapshot, FeedStory } from "../domain/feed/types";
import type {
  FeedReader,
  Playback,
  PlaybackReader,
  StoryClock,
  StoryPreloader,
} from "./ports/types";

export type { FeedSnapshot } from "../domain/feed/types";
export type FeedView = Readonly<{
  kind: "ready" | "empty" | "loading" | "unavailable";
  authors: readonly FeedGroup[];
  cursor: string | null;
  pending: boolean;
}>;
export type StoryFeed = Readonly<{
  view: Readable<FeedView>;
  reconcile: (snapshot: FeedSnapshot) => void;
  refresh: () => Promise<void>;
  refreshForDelivery: () => Promise<"applied" | "retry-later" | "stale">;
  loadMore: () => Promise<void>;
  dispose: () => void;
}>;
export type FeedRefresh = Readonly<{
  request: () => Promise<void>;
  dispose: () => void;
}>;
export type FeedDependencies = Readonly<{
  initial: FeedSnapshot;
  read: FeedReader;
  clock: StoryClock;
}>;
export type PlayerSelection = Readonly<{
  group: FeedGroup;
  index: number;
  story: FeedStory;
}>;
export type PlayerView =
  | Readonly<{ kind: "closed" }>
  | (PlayerSelection & Readonly<{ kind: "loading" | "unavailable" }>)
  | (PlayerSelection & Readonly<{ kind: "ready"; playback: Playback }>);
export type StoryPlayerBrowser = Readonly<{
  view: Readable<PlayerView>;
  open: (group: FeedGroup) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  retry: () => Promise<void>;
  prepareNext: () => Promise<void>;
  close: () => void;
  dispose: () => void;
}>;
export type PlayerDependencies = Readonly<{
  playback: PlaybackReader;
  clock: StoryClock;
  preloader: StoryPreloader;
}>;
