import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { storyCollections } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import {
  createFeedReader,
  createPublicationFeedRefresh,
  createStoryMaintenance,
  publishStory,
  readPublication,
  type StoryDependencies,
} from "../../../apps/be-insta/src/domains/stories/index";
import {
  createFeedCache,
  createFeedInvalidation,
  createStoriesPersistence,
  createStoryStorage,
} from "../../../apps/be-insta/src/domains/stories/server/index";
import { cleanupExpired } from "../../../apps/be-insta/src/domains/stories/use-cases/cleanup";
import { reconcileObjects } from "../../../apps/be-insta/src/domains/stories/use-cases/reconcile";
import { readStoriesConfig } from "../../../apps/be-insta/src/lib/config/stories/read";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import {
  connectDragonfly,
  createActorQuota,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../../fixtures/environment";
import { readStoriesTestConfig } from "../../fixtures/media/config";
import { requireFailure, requireSuccess } from "../../fixtures/outcome";

test("confirmed publication refreshes a warmed real feed and failed invalidation remains recoverable in durable outbox", async () => {
  const config = readTestApiConfig();
  const database = await connectDatabase({ config: config.mongo });
  const actorId = `publication-feed-${crypto.randomUUID()}`;
  let broker: Awaited<ReturnType<typeof connectDragonfly>> | undefined;
  let invalidate: (() => Promise<void>) | undefined;
  let refresh: ReturnType<typeof createPublicationFeedRefresh> | undefined;
  const cleanupErrors: unknown[] = [];
  let primaryFailure: unknown;
  let hasPrimaryFailure = false;
  try {
    broker = await connectDragonfly({ config: config.dragonfly });
    const persistence = await createStoriesPersistence({
      db: database.apiDb,
      startSession: database.startSession,
    });
    const cache = createFeedCache(broker);
    const feedInvalidation = createFeedInvalidation(broker);
    invalidate = feedInvalidation;
    const fault = { fail: false, diagnosticCount: 0 };
    const writes: string[] = [];
    refresh = createPublicationFeedRefresh({
      invalidate: async () => {
        if (fault.fail) throw new Error("Controlled cache-only failure");
        await feedInvalidation();
      },
      onDeferred: () => {
        fault.diagnosticCount++;
      },
    });
    const dependencies: StoryDependencies = {
      ...persistence,
      policy: {
        maxDurationMs: 15000,
        lifetimeMs: 86400000,
        maxFileBytes: 20971520,
        captureSafetyMarginMs: 200,
      },
      activeProfile: "feed-probe",
      keyPrefix: `feed-probe/${actorId}/`,
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
      refreshFeed: refresh.refresh,
      authors: {
        findPublicUser: async ({ id }) =>
          Result.Ok({ id, username: "synthetic" }),
      },
      storage: {
        putUnique: async ({ profile, key, source }) => {
          writes.push(key);
          await new Response(source).arrayBuffer();
          return Result.Ok({ profile, key, byteLength: 1 });
        },
        read: async () => ({
          kind: "found",
          source: new Blob(["verified fixture"]).stream(),
        }),
        delete: async () => {
          throw new Error("Committed publication must not compensate storage");
        },
        list: async () => ({ objects: [] }),
        signPlayback: ({ expiresAt }) => ({
          kind: "signed",
          url: "https://test.invalid",
          expiresAt,
        }),
      },
      media: {
        inspect: async ({ source }) => {
          await source.cancel();
          return Result.Ok({
            container: "mp4",
            videoCodec: "h264",
            audioCodec: "aac",
            durationMs: 1234,
          });
        },
      },
    };
    const reader = createFeedReader({
      stories: persistence.feed,
      cache,
      authors: dependencies.authors,
    });
    const input = {
      actor: { userId: actorId },
      operationId: crypto.randomUUID(),
      file: async () => ({
        source: new Blob(["x"]).stream(),
        complete: Promise.resolve(),
      }),
    };
    await feedInvalidation();
    const warmed = requireSuccess(await reader({ now: Date.now() }));
    expect(warmed.authors.some((group) => group.author.id === actorId)).toBe(
      false,
    );
    expect((await cache.read("20:first")).page).not.toBeNull();
    const first = requireSuccess(await publishStory(input, dependencies));
    const fresh = requireSuccess(await reader({ now: Date.now() }));
    expect(
      fresh.authors
        .find((group) => group.author.id === actorId)
        ?.stories.map((story) => story.id),
    ).toEqual([first.id]);
    // A failed immediate effect must preserve successful publication and its retry event.
    fault.fail = true;
    const secondInput = { ...input, operationId: crypto.randomUUID() };
    const second = requireSuccess(
      await publishStory(secondInput, dependencies),
    );
    expect((await readPublication(secondInput, dependencies)).state).toBe(
      "published",
    );
    const replay = requireSuccess(
      await publishStory(
        {
          ...secondInput,
          file: async () => {
            throw new Error("Replay consumed upload");
          },
        },
        dependencies,
      ),
    );
    expect(replay.id).toBe(second.id);
    expect(writes).toHaveLength(2);
    expect(fault.diagnosticCount).toBe(3);
    expect(
      await database.apiDb
        .collection(storyCollections.outbox)
        .countDocuments({ actorId, state: "pending" }),
    ).toBe(2);
    expect(
      requireSuccess(await reader({ now: Date.now() }))
        .authors.find((group) => group.author.id === actorId)
        ?.stories.map((story) => story.id),
    ).toEqual([first.id]);
    fault.fail = false;
    const maintenance = createStoryMaintenance({
      ...persistence,
      storage: dependencies.storage,
      profiles: [],
      clock: Date.now,
      invalidate: feedInvalidation,
    });
    await maintenance.invalidate(new AbortController().signal);
    const recovered = requireSuccess(await reader({ now: Date.now() }));
    expect(
      recovered.authors
        .find((group) => group.author.id === actorId)
        ?.stories.map((story) => story.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    expect(
      await database.apiDb
        .collection(storyCollections.outbox)
        .countDocuments({ actorId, state: "pending" }),
    ).toBe(0);
  } catch (error) {
    primaryFailure = error;
    hasPrimaryFailure = true;
  }
  const attemptCleanup = async (cleanup: () => Promise<unknown> | unknown) => {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  };
  if (refresh) await attemptCleanup(refresh.close);
  await Promise.all(
    Object.values(storyCollections).map((name) =>
      attemptCleanup(() =>
        database.apiDb
          .collection<{ _id: string; actorId?: string }>(name)
          .deleteMany(
            name === storyCollections.authors ? { _id: actorId } : { actorId },
          ),
      ),
    ),
  );
  if (invalidate) await attemptCleanup(invalidate);
  if (broker) await attemptCleanup(() => broker?.close());
  await attemptCleanup(database.close);
  if (cleanupErrors.length) {
    throw new AggregateError(
      hasPrimaryFailure ? [primaryFailure, ...cleanupErrors] : cleanupErrors,
      "Stories feed integration cleanup failed",
      hasPrimaryFailure ? { cause: primaryFailure } : undefined,
    );
  }
  if (hasPrimaryFailure) throw primaryFailure;
}, 30000);

test("real providers fence stale cache fills, preserve publication replay through acknowledged cleanup and reclaim a late PUT on a retained profile", async () => {
  const config = readTestApiConfig();
  const profiles = readStoriesConfig(readStoriesTestConfig());
  if (profiles.mode !== "enabled")
    throw new Error("Stories test profile required");
  const selected = profiles.profiles.find(
    (profile) => profile.id === profiles.activeProfile,
  );
  if (!selected) throw new Error("Profile missing");
  const run = crypto.randomUUID();
  const actorId = `task4-${run}`;
  const profile = {
    ...selected,
    id: `retained-${run}`,
    prefix: `${selected.prefix}${run}/`,
  };
  const storage = createStoryStorage({ profiles: [profile], clock: Date.now });
  const database = await connectDatabase({ config: config.mongo });
  const broker = await connectDragonfly({ config: config.dragonfly });
  const persistence = await createStoriesPersistence({
    db: database.apiDb,
    startSession: database.startSession,
  });
  const cache = createFeedCache(broker);
  const invalidate = createFeedInvalidation(broker);
  const key = `probe:${run}`;
  const claim = {
    actorId,
    operationId: run,
    attemptId: run,
    profile: profile.id,
    key: `${profile.prefix}story.mp4`,
    now: 1,
    leaseUntil: 120001,
  };
  const signal = new AbortController().signal;
  const put = () =>
    storage.putUnique({
      profile: profile.id,
      key: claim.key,
      source: new Blob(["owned synthetic object"]).stream(),
      maxBytes: 100,
      signal,
    });
  try {
    expect((await persistence.uploads.claim(claim)).kind).toBe("claimed");
    expect((await put()).isOk()).toBe(true);
    const publication = await persistence.persistence.publish({
      claim,
      storyId: run,
      eventId: run,
      author: { id: actorId, username: "synthetic" },
      media: {
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        durationMs: 1000,
      },
      now: 10,
      expiresAt: 100,
    });
    expect(publication.isOk()).toBe(true);
    await invalidate();
    const reader = createFeedReader({
      stories: persistence.feed,
      cache,
      authors: {
        findPublicUser: async ({ id }) =>
          Result.Ok({ id, username: "synthetic" }),
      },
    });
    const page = requireSuccess(await reader({ now: 50 }));
    expect(
      page.authors
        .find((group) => group.author.id === actorId)
        ?.stories.map((story) => story.id),
    ).toEqual([run]);
    const snapshot = await cache.read(key);
    const invalidation = { fail: true };
    const maintenance = createStoryMaintenance({
      ...persistence,
      storage,
      profiles: [profile],
      clock: () => 100,
      invalidate: async () => {
        await invalidate();
        if (invalidation.fail)
          throw new Error("Invalidate acknowledgement lost");
      },
    });
    await expect(maintenance.invalidate(signal)).rejects.toThrow(
      "Invalidate acknowledgement lost",
    );
    expect(await persistence.outbox.pending()).toContain(run);
    invalidation.fail = false;
    await maintenance.invalidate(signal);
    expect(await persistence.outbox.pending()).not.toContain(run);
    expect(await cache.fill({ key, version: snapshot.version, page })).toBe(
      false,
    );
    expect((await cache.read(key)).page).toBeNull();
    const fresh = await cache.read(key);
    expect(await cache.fill({ key, version: fresh.version, page })).toBe(true);
    const ttl = Number(
      await broker.send("PTTL", [`stories:feed:page:${key}:`]),
    );
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30000);
    expect(JSON.stringify((await cache.read(key)).page)).not.toContain(
      claim.key,
    );
    expect(
      requireSuccess(await reader({ now: 100 })).authors.some(
        (group) => group.author.id === actorId,
      ),
    ).toBe(false);
    const unknown = createStoryMaintenance({
      ...persistence,
      profiles: [profile],
      clock: () => 100,
      invalidate,
      storage: {
        ...storage,
        delete: async (input) => {
          await storage.delete(input);
          throw new Error("Acknowledgement lost after actual DELETE");
        },
      },
    });
    await expect(unknown.cleanup(signal)).rejects.toThrow(
      "Stories cleanup incomplete",
    );
    expect(
      (
        await persistence.ownership.read({
          profile: profile.id,
          key: claim.key,
        })
      ).kind,
    ).toBe("found");
    const deleted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const cleanup = cleanupExpired(
      { now: 60100 },
      {
        cleanup: persistence.cleanup,
        storage: {
          delete: async (input) => {
            await storage.delete(input);
            deleted.resolve();
            await release.promise;
          },
        },
      },
    );
    await deleted.promise;
    expect(
      (
        await persistence.ownership.read({
          profile: profile.id,
          key: claim.key,
        })
      ).kind,
    ).toBe("found");
    release.resolve();
    expect((await cleanup).removed).toBe(1);
    expect(
      (
        await persistence.ownership.read({
          profile: profile.id,
          key: claim.key,
        })
      ).kind,
    ).toBe("missing");
    expect(await persistence.persistence.read(claim)).toMatchObject({
      state: "published",
      story: { id: run },
    });
    expect(
      (
        await persistence.uploads.claim({
          ...claim,
          attemptId: crypto.randomUUID(),
          key: `${profile.prefix}duplicate`,
        })
      ).kind,
    ).toBe("existing");
    expect((await put()).isOk()).toBe(true);
    await reconcileObjects(
      { profile: profile.id, prefix: profile.prefix },
      { storage, ownership: persistence.ownership },
    );
    expect(
      await storage.read({ profile: profile.id, key: claim.key, signal }),
    ).toEqual({ kind: "missing" });
    expect(await persistence.ownership.cursor(profile.id)).toBeNull();
    const delayed = {
      ...claim,
      operationId: `pending-${run}`,
      attemptId: crypto.randomUUID(),
      key: `${profile.prefix}pending`,
      now: 1,
      leaseUntil: 2,
    };
    await persistence.uploads.claim(delayed);
    await persistence.cleanup.claim({ now: 3600001, limit: 1 });
    expect(await persistence.persistence.read(delayed)).toMatchObject({
      state: "failed",
      code: "UPLOAD_CANCELLED",
    });
    expect(
      String(
        requireFailure(
          await persistence.persistence.publish({
            claim: delayed,
            storyId: crypto.randomUUID(),
            eventId: crypto.randomUUID(),
            author: { id: actorId, username: "synthetic" },
            media: {
              container: "mp4",
              videoCodec: "h264",
              audioCodec: "aac",
              durationMs: 1000,
            },
            now: 1,
            expiresAt: 100,
          }),
        ),
      ),
    ).toBe("UPLOAD_CANCELLED");
    for (const maximum of [60, 120]) {
      const quota = createActorQuota({
        client: broker,
        key: config.authLimitsKey,
        namespace: `stories:task4:${run}:${maximum}`,
        maximum,
      });
      for (let i = 0; i < maximum; i++)
        expect(requireSuccess(await quota.consume(actorId))).toBe("allowed");
      expect(requireSuccess(await quota.consume(actorId))).toBe("limited");
    }
  } finally {
    await storage.delete({ profile: profile.id, key: claim.key });
    await Promise.all([
      database.apiDb
        .collection(storyCollections.uploads)
        .deleteMany({ actorId }),
      database.apiDb
        .collection(storyCollections.stories)
        .deleteMany({ actorId }),
      database.apiDb
        .collection<{ _id: string }>(storyCollections.authors)
        .deleteMany({ _id: actorId }),
      database.apiDb
        .collection(storyCollections.outbox)
        .deleteMany({ actorId }),
      database.apiDb
        .collection<{ _id: string }>(storyCollections.reconcile)
        .deleteOne({ _id: profile.id }),
    ]);
    broker.close();
    await database.close();
  }
}, 30000);

test("Mongo feed paginates 20 authors with stable tie breaks and five chronological public stories", async () => {
  const database = await connectDatabase({ config: readTestApiConfig().mongo });
  const run = crypto.randomUUID();
  const actorIds = Array.from(
    { length: 22 },
    (_, index) => `task4-${run}-${String(index).padStart(2, "0")}`,
  );
  const documents = actorIds.flatMap((actorId, index) =>
    Array.from({ length: 5 }, (_, storyIndex) => {
      const id = crypto.randomUUID();
      const publishedAt =
        1_000_000_000_000 - Math.floor(index / 2) * 100 + storyIndex;
      return {
        _id: id,
        actorId,
        state: "published",
        expiresAt: 2_000_000_000_000,
        profile: "private-profile",
        key: `private-key-${id}`,
        story: {
          id,
          author: { id: actorId, username: actorId },
          publishedAt,
          expiresAt: 2_000_000_000_000,
          durationMs: 100,
        },
      };
    }),
  );
  try {
    await database.apiDb
      .collection<(typeof documents)[number]>(storyCollections.stories)
      .insertMany(documents);
    const { feed } = await createStoriesPersistence({
      db: database.apiDb,
      startSession: database.startSession,
    });
    const first = await feed.list({
      now: 1_999_999_999_999,
      cursor: null,
      limit: 20,
    });
    expect(first.authors).toHaveLength(20);
    expect(first.authors.map((group) => group.author.id)).toEqual(
      actorIds.slice(0, 20),
    );
    expect(first.cursor).not.toBeNull();
    const last = first.authors.at(-1);
    if (!last) throw new Error("Page empty");
    const second = await feed.list({
      now: 1_999_999_999_999,
      cursor: {
        latestPublishedAt: last.latestPublishedAt,
        authorId: last.author.id,
      },
      limit: 20,
    });
    expect(second.authors.map((group) => group.author.id)).toEqual(
      actorIds.slice(20),
    );
    expect(second.cursor).toBeNull();
    for (const group of [...first.authors, ...second.authors]) {
      expect(group.stories).toHaveLength(5);
      expect(group.stories.map((story) => story.publishedAt)).toEqual(
        group.stories.map((story) => story.publishedAt).sort((a, b) => a - b),
      );
    }
    expect(JSON.stringify(first)).not.toContain("private-");
    expect(
      (await feed.list({ now: 2_000_000_000_000, cursor: null, limit: 20 }))
        .authors,
    ).toEqual([]);
  } finally {
    await database.apiDb
      .collection(storyCollections.stories)
      .deleteMany({ actorId: { $in: actorIds } });
    await database.close();
  }
});
