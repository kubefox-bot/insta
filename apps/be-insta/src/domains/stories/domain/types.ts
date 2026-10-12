import type { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import type { MediaError } from "../ports/media-inspector/interfaces";
export type StoryActor = Readonly<{ userId: string }>;
export type PublicAuthor = Readonly<{ id: string; username: string }>;
export type PublishedStory = Readonly<{
  id: string;
  author: PublicAuthor;
  publishedAt: number;
  expiresAt: number;
  durationMs: number;
}>;
export type StoryError =
  | MediaError
  | StoryErrorCode.ActiveLimit
  | StoryErrorCode.UploadCancelled
  | StoryErrorCode.UploadPending
  | StoryErrorCode.InvalidUpload
  | CommonErrorCode.OperationOutcomeUnknown
  | CommonErrorCode.DependencyUnavailable
  | StoryErrorCode.StoryNotFound;
export type PublicationStatus =
  | Readonly<{ state: "not_found" | "pending"; operationId: string }>
  | Readonly<{ state: "failed"; operationId: string; code: StoryError }>
  | Readonly<{
      state: "published";
      operationId: string;
      story: PublishedStory;
    }>;
export type UploadClaim = Readonly<{
  actorId: string;
  operationId: string;
  attemptId: string;
  profile: string;
  key: string;
  now: number;
  leaseUntil: number;
}>;
export type StoredStory = Readonly<{
  story: PublishedStory;
  profile: string;
  key: string;
}>;
export type StoryFile = (
  signal: AbortSignal,
) => Promise<
  Readonly<{ source: ReadableStream<Uint8Array>; complete: Promise<void> }>
>;
