import type { StoryStorage } from "../../ports/storage/interfaces";
import { storagePolicy, storageStatus } from "./conts";
import { storageFailure } from "./failure";
import type { StorageResolver } from "./types";
/**
 * Создаёт идемпотентное удаление объекта с timeout; 404 допускает как уже удалённый
 * объект, остальные отказы передаёт cleanup для retry.
 */
export const remove =
  (resolve: StorageResolver): StoryStorage["delete"] =>
  async ({ profile, key }) => {
    const client = resolve(profile, key).internal;
    try {
      const response = await fetch(
        client.presign(key, {
          method: "DELETE",
          expiresIn: storagePolicy.requestSignatureSeconds,
        }),
        {
          method: "DELETE",
          signal: AbortSignal.timeout(storagePolicy.operationTimeoutMs),
          redirect: "error",
        },
      );
      await response.body?.cancel();
      if (!response.ok && response.status !== storageStatus.notFound)
        throw new Error("Stories storage DELETE failed");
    } catch (error) {
      throw storageFailure({ operation: "remove", cause: error });
    }
  };
