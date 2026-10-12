import type { Db } from "mongodb";
import { maintenancePolicy } from "../../domain/maintenance/conts";
import type { StoryCleanup } from "../../ports/maintenance/interfaces";
import { claimCleanup } from "./cleanup/claim";
import { storyCollections } from "./conts";
import type { UploadDocument } from "./types";
/**
 * Собирает physical cleanup с majority-записью и токенами захвата, сохраняя durable
 * историю операции после удаления объекта.
 */
export const createStoryCleanup = (db: Db): StoryCleanup => {
  const uploads = db.collection<UploadDocument>(storyCollections.uploads, {
    writeConcern: { w: "majority" },
  });
  return {
    claim: claimCleanup(uploads),
    /**
     * Удаляет индекс истёкшей истории и подтверждает physical removal только по своему
     * cleanup token. Tombstone с canonical ответом сохраняет; потерю claim сообщает
     * ошибкой.
     */
    acknowledge: async (input) => {
      // A story is expired before its account can be claimed; removing this index is idempotent.
      await db
        .collection(storyCollections.stories)
        .deleteOne({ profile: input.profile, key: input.key });
      // Retain the operation tombstone and canonical response forever; it no longer owns an object.
      const acknowledged = await uploads.updateOne(
        {
          _id: input.id,
          physicalState: "cleanup_pending",
          cleanupToken: input.token,
        },
        {
          $set: { physicalState: "removed", leaseUntil: 0 },
          $unset: { cleanupToken: "", cleanupLeaseUntil: "", retryAt: "" },
        },
      );
      if (acknowledged.matchedCount !== 1)
        throw new Error("Cleanup claim lost");
    },
    /**
     * Освобождает cleanup lease совпавшего токена и назначает следующий retry, увеличивая
     * счётчик попыток без удаления учётной записи.
     */
    retry: async (input) => {
      await uploads.updateOne(
        {
          _id: input.id,
          physicalState: "cleanup_pending",
          cleanupToken: input.token,
        },
        {
          $set: {
            retryAt: input.now + maintenancePolicy.cleanupMs,
            cleanupLeaseUntil: 0,
          },
          $inc: { cleanupAttempts: 1 },
        },
      );
    },
  };
};
