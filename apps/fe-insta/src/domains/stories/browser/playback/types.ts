import type { Writable } from "svelte/store";
import type { createExpiry } from "../lib/expiry/create";
import type { createRequestLifetime } from "../lib/request-lifetime/create";
import type { createStoryPrefetch } from "../prefetch";
import type { PlayerDependencies, PlayerView } from "../types";
export type SelectionDependencies = Pick<
  PlayerDependencies,
  "clock" | "playback"
> &
  Readonly<{
    state: Writable<PlayerView>;
    lifetime: ReturnType<typeof createRequestLifetime>;
    expiry: ReturnType<typeof createExpiry>;
    prefetch: ReturnType<typeof createStoryPrefetch>;
    close: () => void;
  }>;
