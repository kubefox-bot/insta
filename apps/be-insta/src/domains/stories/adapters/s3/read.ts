import type { StoryStorage } from "../../ports/storage/interfaces";
import { storagePolicy, storageStatus } from "./conts";
import { storageFailure } from "./failure";
import type { StorageResolver } from "./types";
/**
 * Создаёт GET с общей отменой и timeout, различая 404 и сбой storage. Успешный body
 * передаёт потребителю для чтения/отмены; неуспешный освобождает здесь.
 */
export const read =
  (resolve: StorageResolver): StoryStorage["read"] =>
  async ({ profile, key, signal }) => {
    const client = resolve(profile, key).internal;
    try {
      const response = await fetch(
        client.presign(key, {
          expiresIn: storagePolicy.requestSignatureSeconds,
        }),
        {
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(storagePolicy.operationTimeoutMs),
          ]),
          redirect: "error",
        },
      );
      if (response.status === storageStatus.notFound) {
        await response.body?.cancel();
        return { kind: "missing" };
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("Stories storage GET failed");
      }
      return { kind: "found", source: response.body };
    } catch (error) {
      throw storageFailure({ operation: "read", cause: error });
    }
  };
