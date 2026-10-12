import type { createStorageProfiles } from "./profiles";
export type StorageProfile = Readonly<{
  id: string;
  endpoint: string;
  playbackEndpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}>;

export type StorageResolver = ReturnType<typeof createStorageProfiles>;
