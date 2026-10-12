import { expect, test } from "bun:test";
import { storyCollections } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import {
  createStoriesPersistence,
  createStoryStorage,
} from "../../../apps/be-insta/src/domains/stories/server/index";
import { reconcileObjects } from "../../../apps/be-insta/src/domains/stories/use-cases/reconcile";
import { readStoriesConfig } from "../../../apps/be-insta/src/lib/config/stories/read";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { readTestApiConfig } from "../../fixtures/environment";
import { readStoriesTestConfig } from "../../fixtures/media/config";

test("failed real Mongo ownership read cannot delete an actual RustFS object; recovery completes a new authoritative pass", async () => {
  const config = readStoriesConfig(readStoriesTestConfig());
  if (config.mode !== "enabled") throw new Error("Stories profile required");
  const original = config.profiles.find(
    (profile) => profile.id === config.activeProfile,
  );
  if (!original) throw new Error("Profile missing");
  const run = crypto.randomUUID();
  const profile = {
    ...original,
    id: `abuse-${run}`,
    prefix: `${original.prefix}${run}/`,
  };
  const key = `${profile.prefix}late.mp4`;
  const storage = createStoryStorage({ profiles: [profile], clock: Date.now });
  const database = await connectDatabase({ config: readTestApiConfig().mongo });
  const persistence = await createStoriesPersistence({
    db: database.apiDb,
    startSession: database.startSession,
  });
  const signal = new AbortController().signal;
  const deletes: string[] = [];
  try {
    expect(
      (
        await storage.putUnique({
          profile: profile.id,
          key,
          source: new Blob(["late synthetic effect"]).stream(),
          maxBytes: 100,
          signal,
        })
      ).isOk(),
    ).toBe(true);
    await database.close();
    await expect(
      reconcileObjects(
        { profile: profile.id, prefix: profile.prefix },
        {
          storage: {
            ...storage,
            delete: async (input) => {
              deletes.push(input.key);
              await storage.delete(input);
            },
          },
          ownership: { ...persistence.ownership, cursor: async () => null },
        },
      ),
    ).rejects.toThrow("Stories ownership unavailable");
    expect(deletes).toEqual([]);
    const survived = await storage.read({ profile: profile.id, key, signal });
    expect(survived.kind).toBe("found");
    if (survived.kind === "found")
      expect(await new Response(survived.source).text()).toBe(
        "late synthetic effect",
      );
    const recovered = await connectDatabase({
      config: readTestApiConfig().mongo,
    });
    try {
      const healthy = await createStoriesPersistence({
        db: recovered.apiDb,
        startSession: recovered.startSession,
      });
      await reconcileObjects(
        { profile: profile.id, prefix: profile.prefix },
        { storage, ownership: healthy.ownership },
      );
      expect(await storage.read({ profile: profile.id, key, signal })).toEqual({
        kind: "missing",
      });
      await recovered.apiDb
        .collection<{ _id: string }>(storyCollections.reconcile)
        .deleteOne({ _id: profile.id });
    } finally {
      await recovered.close();
    }
  } finally {
    await storage.delete({ profile: profile.id, key });
    await database.close();
  }
}, 30000);
