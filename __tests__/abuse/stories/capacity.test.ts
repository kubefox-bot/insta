import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { storyCollections } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import { createStoryPublisherLifetime } from "../../../apps/be-insta/src/domains/stories/index";
import {
  createMediaInspector,
  createStoriesPersistence,
  createStoryStorage,
} from "../../../apps/be-insta/src/domains/stories/server/index";
import { readStoriesConfig } from "../../../apps/be-insta/src/lib/config/stories/read";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { waitUntil } from "../../fixtures/barrier";
import { readTestApiConfig } from "../../fixtures/environment";
import { readStoriesTestConfig } from "../../fixtures/media/config";

test("held real RustFS effects keep finite admission after cancellation until actual provider settlement; Mongo retains ownership", async () => {
  const config = readStoriesConfig(readStoriesTestConfig());
  if (config.mode !== "enabled") throw new Error("Stories profile required");
  const profile = config.profiles.find(
    (value) => value.id === config.activeProfile,
  );
  if (!profile) throw new Error("Missing active profile");
  const database = await connectDatabase({ config: readTestApiConfig().mongo });
  const persistence = await createStoriesPersistence({
    db: database.apiDb,
    startSession: database.startSession,
  });
  const storage = createStoryStorage({
    profiles: config.profiles,
    clock: Date.now,
  });
  const media = createMediaInspector();
  const run = crypto.randomUUID();
  const actorId = `capacity-${run}`;
  const held = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const objects: string[] = [];
  const publisher = createStoryPublisherLifetime({
    refreshFeed: async () => "deferred",
    policy: config.policy,
    ...persistence,
    storage: {
      ...storage,
      putUnique: async (input) => {
        const result = await storage.putUnique(input);
        if (result.isError()) return result;
        objects.push(input.key);
        if (objects.length === 2) entered.resolve();
        // Controlled response settlement after a real provider has durably stored bytes.
        await held.promise;
        return result;
      },
    },
    media,
    authors: {
      findPublicUser: async () =>
        Result.Ok({ id: actorId, username: "synthetic" }),
    },
    activeProfile: profile.id,
    keyPrefix: `${profile.prefix}${run}/`,
    clock: Date.now,
    uuid: () => crypto.randomUUID(),
  });
  const controller = new AbortController();
  let reads = 0;
  const publish = (operationId: string, signal?: AbortSignal) =>
    publisher.publish({
      actor: { userId: actorId },
      operationId,
      signal,
      file: async () => {
        reads++;
        return {
          source: Bun.file(
            new URL("../../fixtures/media/chrome-valid.mp4", import.meta.url),
          ).stream(),
          complete: Promise.resolve(),
        };
      },
    });
  const first = publish("cancelled", controller.signal);
  const second = publish("survivor");
  try {
    await entered.promise;
    expect(reads).toBe(2);
    expect((await publish("overflow")).toJSON()).toMatchObject({
      tag: "Error",
      error: "BUSY",
    });
    controller.abort();
    await waitUntil({
      timeoutMs: 5000,
      check: async () =>
        (
          await persistence.persistence.read({
            actorId,
            operationId: "cancelled",
          })
        ).state === "failed",
    });
    expect((await publish("after-cancel")).toJSON()).toMatchObject({
      tag: "Error",
      error: "BUSY",
    });
    expect(reads).toBe(2);
    expect(
      await database.apiDb
        .collection(storyCollections.uploads)
        .countDocuments({ actorId }),
    ).toBe(2);
    for (const key of objects) {
      expect(
        (await persistence.ownership.read({ profile: profile.id, key })).kind,
      ).toBe("found");
      const actual = await storage.read({
        profile: profile.id,
        key,
        signal: new AbortController().signal,
      });
      expect(actual.kind).toBe("found");
      if (actual.kind === "found") await actual.source.cancel();
    }
    held.resolve();
    expect((await first).toJSON()).toMatchObject({
      tag: "Error",
      error: "UPLOAD_CANCELLED",
    });
    expect((await second).isOk()).toBe(true);
    expect(
      await database.apiDb
        .collection(storyCollections.stories)
        .countDocuments({ actorId }),
    ).toBe(1);
    expect(
      await database.apiDb
        .collection(storyCollections.outbox)
        .countDocuments({ actorId }),
    ).toBe(1);
  } finally {
    held.resolve();
    await Promise.allSettled([first, second]);
    await publisher.close();
    await media.close();
    for (const key of objects)
      await storage.delete({ profile: profile.id, key });
    for (const name of Object.values(storyCollections))
      await database.apiDb
        .collection<{ _id: string; actorId?: string }>(name)
        .deleteMany(
          name === storyCollections.authors ? { _id: actorId } : { actorId },
        );
    await database.close();
  }
}, 30000);
