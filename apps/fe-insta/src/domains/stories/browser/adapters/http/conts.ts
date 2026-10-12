import {
  CommonErrorCode,
  MessageErrorCode,
  StoryErrorCode,
} from "@insta/contracts/errors";
export const publicationTransport = {
  timeoutMs: 90_000,
  unauthorized: 401,
  forbidden: 403,
  invalid: 400,
  tooLarge: 413,
} as const;
export const knownPublicationRejections = [
  StoryErrorCode.InvalidUpload,
  StoryErrorCode.FileTooLarge,
  StoryErrorCode.UnsupportedMedia,
  StoryErrorCode.MalformedMedia,
  StoryErrorCode.DurationUnprovable,
  StoryErrorCode.TooLong,
  StoryErrorCode.ActiveLimit,
  MessageErrorCode.IdempotencyConflict,
  CommonErrorCode.Forbidden,
] as const;
export const recordingFilenames = {
  "video/webm": "story.webm",
  "video/mp4": "story.mp4",
} as const;
