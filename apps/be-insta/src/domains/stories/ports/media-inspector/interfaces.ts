import type { Result } from "@bloodyowl/boxed";
import type { StoryErrorCode } from "@insta/contracts/errors";
export type VerifiedMedia =
  | Readonly<{
      container: "mp4";
      videoCodec: "h264";
      audioCodec: "aac";
      durationMs: number;
    }>
  | Readonly<{
      container: "webm";
      videoCodec: "vp8" | "vp9";
      audioCodec: "opus";
      durationMs: number;
    }>;
export type MediaError =
  | StoryErrorCode.UnsupportedMedia
  | StoryErrorCode.MalformedMedia
  | StoryErrorCode.DurationUnprovable
  | StoryErrorCode.FileTooLarge
  | StoryErrorCode.TooLong
  | StoryErrorCode.Deadline
  | StoryErrorCode.Busy
  | StoryErrorCode.InspectorUnavailable;
export interface MediaInspector {
  readonly inspect: (
    input: Readonly<{
      source: ReadableStream<Uint8Array>;
      maxBytes: number;
      maxDurationMs: number;
      deadline: number;
    }>,
  ) => Promise<Result<VerifiedMedia, MediaError>>;
}
