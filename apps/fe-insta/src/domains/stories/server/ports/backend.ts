import type { Result } from "@bloodyowl/boxed";
import type { StoryBackendFailure } from "./types";
export type StoryBackend = (
  input: Readonly<{
    operation: "publish" | "publication" | "playback" | "feed";
    id?: string;
    accessToken?: string;
    request: Request;
  }>,
) => Promise<Result<Response, StoryBackendFailure>>;
