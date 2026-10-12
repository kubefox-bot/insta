import { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";

import type { StoryError } from "../../domain/types";
export const storiesDependenciesToken = "STORIES_DEPENDENCIES";
export const multipartLimits = {
  fields: 8,
  fieldBytes: 4096,
  parts: 9,
} as const;
export const storyErrorStatus = {
  [StoryErrorCode.ActiveLimit]: 409,
  [StoryErrorCode.UploadCancelled]: 409,
  [StoryErrorCode.UploadPending]: 409,
  [StoryErrorCode.InvalidUpload]: 400,
  [CommonErrorCode.OperationOutcomeUnknown]: 503,
  [CommonErrorCode.DependencyUnavailable]: 503,
  [StoryErrorCode.StoryNotFound]: 404,
  [StoryErrorCode.UnsupportedMedia]: 422,
  [StoryErrorCode.MalformedMedia]: 422,
  [StoryErrorCode.DurationUnprovable]: 422,
  [StoryErrorCode.FileTooLarge]: 413,
  [StoryErrorCode.TooLong]: 422,
  [StoryErrorCode.Deadline]: 503,
  [StoryErrorCode.Busy]: 503,
  [StoryErrorCode.InspectorUnavailable]: 503,
} as const satisfies Record<StoryError, number>;
export const storyReadsToken = "STORY_READS";
