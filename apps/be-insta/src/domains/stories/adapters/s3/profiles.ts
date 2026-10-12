import { S3Client } from "bun";
import { storagePolicy } from "./conts";
import type { StorageProfile } from "./types";
/**
 * Создаёт отдельные internal/playback клиенты без автоматических retry; resolver
 * отклоняет дубликаты профилей и ключи вне разрешённого префикса.
 */
export const createStorageProfiles = (profiles: readonly StorageProfile[]) => {
  const clients = new Map(
    profiles.map((profile) => {
      const options = {
        bucket: profile.bucket,
        region: profile.region,
        accessKeyId: profile.accessKeyId,
        secretAccessKey: profile.secretAccessKey,
        retry: 0,
      };
      return [
        profile.id,
        {
          prefix: profile.prefix,
          internal: new S3Client({ ...options, endpoint: profile.endpoint }),
          playback: new S3Client({
            ...options,
            endpoint: profile.playbackEndpoint,
          }),
        },
      ] as const;
    }),
  );
  if (clients.size !== profiles.length)
    throw new Error("Duplicate storage profile");
  return (id: string, key: string) => {
    const client = clients.get(id);
    if (!client) throw new Error("Unknown storage profile");
    if (
      !key.startsWith(client.prefix) ||
      !storagePolicy.keyPattern.test(key.replace(/\/$/, "")) ||
      key.split("/").some((part) => part === "." || part === "..")
    )
      throw new Error("Invalid storage key");
    return client;
  };
};
