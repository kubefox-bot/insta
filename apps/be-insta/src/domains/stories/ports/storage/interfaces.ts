import type { Result } from "@bloodyowl/boxed";
import type { StoryErrorCode } from "@insta/contracts/errors";
import type { SignedPlayback } from "./types";
export type StoredIdentity = Readonly<{
  profile: string;
  key: string;
  byteLength: number;
}>;
export type StorageRead =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "found"; source: ReadableStream<Uint8Array> }>;
export type StoragePutError =
  | "OBJECT_EXISTS"
  | StoryErrorCode.FileTooLarge
  | "ABORTED";
export interface StoryStorage {
  readonly putUnique: (
    input: Readonly<{
      profile: string;
      key: string;
      source: ReadableStream<Uint8Array>;
      maxBytes: number;
      signal: AbortSignal;
    }>,
  ) => Promise<Result<StoredIdentity, StoragePutError>>;
  readonly read: (
    input: Readonly<{ profile: string; key: string; signal: AbortSignal }>,
  ) => Promise<StorageRead>;
  readonly delete: (
    input: Readonly<{ profile: string; key: string }>,
  ) => Promise<void>;
  readonly list: (
    input: Readonly<{
      profile: string;
      prefix: string;
      cursor?: string;
      limit: number;
    }>,
  ) => Promise<
    Readonly<{ objects: readonly StoredIdentity[]; cursor?: string }>
  >;
  readonly signPlayback: (
    input: Readonly<{ profile: string; key: string; expiresAt: number }>,
  ) => SignedPlayback;
}
