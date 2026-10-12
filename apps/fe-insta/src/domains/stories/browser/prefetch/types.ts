import type { createExpiry } from "../lib/expiry/create";
import type { createRequestLifetime } from "../lib/request-lifetime/create";
import type {
  PlaybackReader,
  StoryClock,
  StoryPreloader,
} from "../ports/types";
export type PrefetchDependencies = Readonly<{
  playback: PlaybackReader;
  clock: StoryClock;
  preloader: StoryPreloader;
}>;
export type PrefetchOwner = { storyId: string; releaseMedia: () => void };
export type PreparationDependencies = PrefetchDependencies &
  Readonly<{
    owner: PrefetchOwner;
    lifetime: ReturnType<typeof createRequestLifetime>;
    expiry: ReturnType<typeof createExpiry>;
    release: () => void;
  }>;
