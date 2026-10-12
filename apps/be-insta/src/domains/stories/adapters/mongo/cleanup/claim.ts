import type { Collection } from "mongodb";
import { maintenancePolicy } from "../../../domain/maintenance/conts";
import type { StoryCleanup } from "../../../ports/maintenance/interfaces";
import type { UploadDocument } from "../types";
/**
 * Последовательно захватывает ограниченную пачку истёкших либо давно незавершённых upload
 * со свободным cleanup lease. Abort прекращает новые claims; каждому объекту выдаётся
 * отдельный токен.
 */
export const claimCleanup =
  (uploads: Collection<UploadDocument>): StoryCleanup["claim"] =>
  async ({ now, limit, signal }) => {
    const accounts = [];
    for (let count = 0; count < limit; count++) {
      if (signal?.aborted) break;
      const token = crypto.randomUUID();
      const upload = await uploads.findOneAndUpdate(
        {
          physicalState: { $ne: "removed" },
          $and: [
            {
              $or: [
                { cleanupLeaseUntil: { $exists: false } },
                { cleanupLeaseUntil: { $lte: now } },
              ],
            },
            {
              $or: [
                { retryAt: { $exists: false } },
                { retryAt: { $lte: now } },
              ],
            },
            {
              $or: [
                { physicalState: "cleanup_pending" },
                {
                  "status.state": "published",
                  "status.story.expiresAt": { $lte: now },
                },
                {
                  "status.state": { $in: ["pending", "failed"] },
                  now: { $lte: now - maintenancePolicy.unfinishedMs },
                  leaseUntil: { $lte: now },
                },
              ],
            },
          ],
        },
        {
          $set: {
            physicalState: "cleanup_pending",
            cleanupToken: token,
            cleanupLeaseUntil: now + maintenancePolicy.leaseMs,
          },
        },
        { returnDocument: "after", sort: { now: 1 } },
      );
      if (!upload) break;
      accounts.push({
        id: upload._id,
        token,
        profile: upload.profile,
        key: upload.key,
      });
    }
    return accounts;
  };
