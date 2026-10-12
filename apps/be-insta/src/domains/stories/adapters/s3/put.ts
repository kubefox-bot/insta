import { Result } from "@bloodyowl/boxed";
import { readBounded } from "../../lib/streams/read-bounded";
import type { StoryStorage } from "../../ports/storage/interfaces";
import { storedContentType } from "./content-type";
import { storagePolicy, storageStatus } from "./conts";
import { storageFailure } from "./failure";
import type { StorageResolver } from "./types";
/**
 * Создаёт запись ограниченного потока через conditional PUT без перезаписи объекта.
 * Освобождает response body; конфликт возвращает отдельно, timeout/сбой не доказывает
 * отсутствие записи.
 */
export const put =
  (resolve: StorageResolver): StoryStorage["putUnique"] =>
  async ({ profile, key, source, maxBytes, signal }) => {
    const client = resolve(profile, key).internal;
    const bounded = await readBounded({ source, maxBytes, signal });
    if (bounded.isError()) return Result.Error(bounded.getError());
    const bytes = bounded.get();
    try {
      const response = await fetch(
        client.presign(key, {
          method: "PUT",
          expiresIn: storagePolicy.requestSignatureSeconds,
        }),
        {
          method: "PUT",
          body: bytes,
          headers: {
            "if-none-match": "*",
            "content-type": storedContentType(bytes),
          },
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(storagePolicy.operationTimeoutMs),
          ]),
          redirect: "error",
        },
      );
      await response.body?.cancel();
      if (
        response.status === storageStatus.preconditionFailed ||
        response.status === storageStatus.conflict
      )
        return Result.Error("OBJECT_EXISTS");
      if (!response.ok) throw new Error("Stories storage PUT failed");
      return Result.Ok({ profile, key, byteLength: bytes.byteLength });
    } catch (error) {
      throw storageFailure({ operation: "put", cause: error });
    }
  };
