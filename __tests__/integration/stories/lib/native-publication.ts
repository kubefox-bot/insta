import { Result } from "@bloodyowl/boxed";
import { storyCollections } from "../../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import type { UploadDocument } from "../../../../apps/be-insta/src/domains/stories/adapters/mongo/types";
import { maintenancePolicy } from "../../../../apps/be-insta/src/domains/stories/domain/maintenance/conts";
import {
  createMediaInspector,
  createStoriesPersistence,
  createStoryStorage,
} from "../../../../apps/be-insta/src/domains/stories/server/index";
import { readStoriesConfig } from "../../../../apps/be-insta/src/lib/config/stories/read";
import { connectDatabase } from "../../../../apps/be-insta/src/lib/database/index";
import { readTestApiConfig } from "../../../fixtures/environment";
import { readStoriesTestConfig } from "../../../fixtures/media/config";
import { deleteOwnedStoryRecords } from "./cleanup-records";

export const createNativePublicationFixture = async () => {
  const config = readStoriesConfig(readStoriesTestConfig());
  if (config.mode !== "enabled") throw new Error("Enabled Stories required");
  const selected = config.profiles.find(
    (item) => item.id === config.activeProfile,
  );
  if (!selected) throw new Error("Active profile missing");
  const run = crypto.randomUUID();
  const database = await connectDatabase({ config: readTestApiConfig().mongo });
  const db = database.apiDb;
  const actors = new Set<string>();
  const profile = { ...selected, prefix: `${selected.prefix}${run}/` };
  const storage = createStoryStorage({ profiles: [profile], clock: Date.now });
  const media = createMediaInspector();
  try {
    const persistence = await createStoriesPersistence({
      db,
      startSession: database.startSession,
    });
    const dependencies = {
      refreshFeed: async () => "deferred" as const,
      policy: config.policy,
      ...persistence,
      storage,
      media,
      keyPrefix: profile.prefix,
      activeProfile: profile.id,
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
      authors: {
        findPublicUser: async ({ id }: Readonly<{ id: string }>) =>
          Result.Ok({ id, username: "synthetic" }),
      },
    };
    return {
      db,
      dependencies,
      profile,
      actor: () => {
        const id = crypto.randomUUID();
        actors.add(id);
        return id;
      },
      claimRejected: async ({
        actorId,
        operationId,
      }: Readonly<{ actorId: string; operationId: string }>) => {
        if (!actors.has(actorId)) throw Error("Foreign fixture actor");
        const token = crypto.randomUUID();
        const upload = await db
          .collection<UploadDocument>(storyCollections.uploads)
          .findOneAndUpdate(
            {
              actorId,
              operationId,
              "status.state": "failed",
              physicalState: { $ne: "removed" },
            },
            {
              $set: {
                physicalState: "cleanup_pending",
                cleanupToken: token,
                cleanupLeaseUntil: Date.now() + maintenancePolicy.leaseMs,
              },
            },
            { returnDocument: "after" },
          );
        if (!upload) throw Error("Owned failed upload missing");
        return {
          id: upload._id,
          token,
          profile: upload.profile,
          key: upload.key,
        };
      },
      dispose: async () => {
        try {
          await media.close();
          const page = await storage.list({
            profile: profile.id,
            prefix: profile.prefix,
            limit: 100,
          });
          for (const object of page.objects)
            await storage.delete({ profile: profile.id, key: object.key });
          await deleteOwnedStoryRecords({ db, actors });
        } finally {
          await database.close();
        }
      },
    };
  } catch (error) {
    await media.close();
    await database.close();
    throw error;
  }
};
