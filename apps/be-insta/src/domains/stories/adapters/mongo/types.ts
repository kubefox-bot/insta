import type {
  PublicationStatus,
  StoredStory,
  UploadClaim,
} from "../../domain/types";
export type UploadDocument = UploadClaim &
  Readonly<{
    _id: string;
    status: PublicationStatus;
    updatedAt: number;
    physicalState?: "cleanup_pending" | "removed";
    cleanupToken?: string;
    cleanupLeaseUntil?: number;
    retryAt?: number;
    cleanupAttempts?: number;
  }>;
export type StoryDocument = StoredStory &
  Readonly<{
    _id: string;
    actorId: string;
    expiresAt: number;
    state: "published";
  }>;
export type AuthorDocument = Readonly<{ _id: string; revision: number }>;

export type ReconcileDocument = Readonly<{
  _id: string;
  cursor: string | null;
}>;

export type PublicationRecording = (
  input: Readonly<{
    session: import("mongodb").ClientSession;
    event: Readonly<{
      eventId: string;
      operationId: string;
      occurredAt: number;
    }>;
  }>,
) => Promise<void>;

export type PublicationAcknowledgement = (
  input: Readonly<{
    session: import("mongodb").ClientSession;
    eventId: string;
  }>,
) => Promise<void>;
