import type { Result } from "@bloodyowl/boxed";
import type { StoryRuntimePolicy } from "@insta/contracts/stories";
import type {
  PublicAuthor,
  PublicationStatus,
  PublishedStory,
  StoredStory,
  StoryError,
  UploadClaim,
} from "../../domain/types";
import type { StoryAuthors } from "../authors/interfaces";
import type {
  PublicationFeedIdentity,
  PublicationFeedRefresh,
} from "../feed/types";
import type {
  MediaInspector,
  VerifiedMedia,
} from "../media-inspector/interfaces";
import type { StoryStorage } from "../storage/interfaces";
export interface StoryUploads {
  readonly claim: (
    input: UploadClaim,
  ) => Promise<
    | Readonly<{ kind: "claimed"; claim: UploadClaim }>
    | Readonly<{ kind: "existing"; status: PublicationStatus }>
  >;
  readonly renew: (
    input: UploadClaim & Readonly<{ leaseUntil: number }>,
  ) => Promise<boolean>;
  readonly cancel: (
    input: UploadClaim & Readonly<{ code: StoryError }>,
  ) => Promise<void>;
}
export interface StoryPersistence {
  readonly read: (
    input: Readonly<{ actorId: string; operationId: string }>,
  ) => Promise<PublicationStatus>;
  readonly findStory: (id: string) => Promise<StoredStory | null>;
  readonly publish: (
    input: Readonly<{
      claim: UploadClaim;
      storyId: string;
      eventId: string;
      author: PublicAuthor;
      media: VerifiedMedia;
      now: number;
      expiresAt: number;
    }>,
  ) => Promise<Result<PublishedStory, StoryError>>;
}
export type StoryDependencies = Readonly<{
  policy: StoryRuntimePolicy;
  uploads: StoryUploads;
  persistence: StoryPersistence;
  storage: StoryStorage;
  media: MediaInspector;
  authors: StoryAuthors;
  /** Ожидаемые отказы cache дают deferred с сохранённым durable outbox, без rejection. */
  refreshFeed: (
    input: PublicationFeedIdentity,
  ) => Promise<PublicationFeedRefresh>;
  publicationDelivery?: Readonly<{
    dispatch: (signal?: AbortSignal) => Promise<void>;
    deferred: () => void;
  }>;
  activeProfile: string;
  keyPrefix: string;
  clock: () => number;
  uuid: () => string;
}>;
