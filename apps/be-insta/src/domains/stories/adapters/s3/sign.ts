import type { StoryStorage } from "../../ports/storage/interfaces";
import { storagePolicy } from "./conts";
import { readPlaybackWindow } from "./playback-window";
import type { StorageResolver } from "./types";
/**
 * Подписывает GET без сетевого запроса и сверяет фактический срок URL. Часы
 * передаёт владелец composition; неполная секунда означает истёкшее окно,
 * а исключение провайдера остаётся исключением.
 */
export const sign =
  ({
    resolve,
    clock,
  }: Readonly<{
    resolve: StorageResolver;
    clock: () => number;
  }>): StoryStorage["signPlayback"] =>
  ({ profile, key, expiresAt }) => {
    const client = resolve(profile, key).playback;
    const remainingMs = expiresAt - clock();
    if (
      !Number.isSafeInteger(expiresAt) ||
      remainingMs >
        storagePolicy.maxPlaybackSeconds * storagePolicy.millisecondsPerSecond
    )
      throw new Error("Invalid playback expiry");
    const seconds = Math.floor(
      remainingMs / storagePolicy.millisecondsPerSecond,
    );
    if (seconds < 1) return { kind: "expired" };
    const url = client.presign(key, { method: "GET", expiresIn: seconds });
    return readPlaybackWindow({
      url,
      requestedExpiresAt: expiresAt,
      nowMs: clock(),
    });
  };
