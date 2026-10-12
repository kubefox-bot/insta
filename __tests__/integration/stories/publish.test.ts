import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { storyCollections } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import type { StoryDependencies } from "../../../apps/be-insta/src/domains/stories/index";
import {
  publishStory,
  readPublication,
} from "../../../apps/be-insta/src/domains/stories/index";
import { createStoriesPersistence } from "../../../apps/be-insta/src/domains/stories/server/index";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { readTestApiConfig } from "../../fixtures/environment";

test("real Mongo serializes six valid publications, durable operation replay and cancellation", async () => {
  const database = await connectDatabase({ config: readTestApiConfig().mongo });
  const actorId = crypto.randomUUID();
  const lateActorId = crypto.randomUUID();
  const writes: string[] = [];
  try {
    const persistence = await createStoriesPersistence({
      db: database.apiDb,
      startSession: database.startSession,
    });
    const dependencies: StoryDependencies = {
      refreshFeed: async () => "deferred",
      policy: {
        maxDurationMs: 15000,
        lifetimeMs: 86400000,
        maxFileBytes: 20971520,
        captureSafetyMarginMs: 200,
      },
      ...persistence,
      keyPrefix: "stories/",
      activeProfile: "test",
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
      authors: {
        findPublicUser: async ({ id }) =>
          Result.Ok({ id, username: "synthetic" }),
      },
      storage: {
        putUnique: async (input) => {
          writes.push(input.key);
          await new Response(input.source).arrayBuffer();
          return Result.Ok({
            profile: input.profile,
            key: input.key,
            byteLength: 1,
          });
        },
        read: async () => ({
          kind: "found",
          source: new Blob(["verified fixture"]).stream(),
        }),
        delete: async () => {
          throw new Error("Unexpected compensation");
        },
        list: async () => ({ objects: [] }),
        signPlayback: ({ expiresAt }) => ({
          kind: "signed",
          url: "https://test.invalid",
          expiresAt,
        }),
      },
      // Actual native inspection was separately verified by Task2; this gate isolates Mongo concurrency.
      media: {
        inspect: async ({ source }) => {
          await source.cancel();
          return Result.Ok({
            container: "mp4",
            videoCodec: "h264",
            audioCodec: "aac",
            durationMs: 1000,
          });
        },
      },
    };
    const file = async () => ({
      source: new Blob(["x"]).stream(),
      complete: Promise.resolve(),
    });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        publishStory(
          { actor: { userId: actorId }, operationId: `race-${i}`, file },
          dependencies,
        ),
      ),
    );
    expect(results.filter((r) => r.isOk())).toHaveLength(5);
    expect<unknown>(
      results.filter((r) => r.isError()).map((r) => r.getError()),
    ).toEqual(["ACTIVE_LIMIT"]);
    const winner = results.findIndex((r) => r.isOk());
    const replay = await publishStory(
      {
        actor: { userId: actorId },
        operationId: `race-${winner}`,
        file: async () => {
          throw new Error("Replay consumed file");
        },
      },
      dependencies,
    );
    expect(replay.toJSON()).toEqual(results[winner]?.toJSON());
    expect(writes).toHaveLength(6);
    expect(
      (
        await readPublication(
          { actor: { userId: "stranger" }, operationId: `race-${winner}` },
          dependencies,
        )
      ).state,
    ).toBe("not_found");
    expect(
      await database.apiDb
        .collection(storyCollections.stories)
        .countDocuments({ actorId }),
    ).toBe(5);
    expect(
      await database.apiDb
        .collection(storyCollections.outbox)
        .countDocuments({ actorId }),
    ).toBe(5);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const delayed = publishStory(
      { actor: { userId: lateActorId }, operationId: "late", file },
      {
        ...dependencies,
        uploads: {
          ...dependencies.uploads,
          claim: async (input) => {
            entered.resolve();
            await release.promise;
            return dependencies.uploads.claim(input);
          },
        },
      },
    );
    await entered.promise;
    expect(
      (
        await readPublication(
          { actor: { userId: lateActorId }, operationId: "late" },
          dependencies,
        )
      ).state,
    ).toBe("not_found");
    const retries = await Promise.all(
      [1, 2].map(() =>
        publishStory(
          { actor: { userId: lateActorId }, operationId: "late", file },
          dependencies,
        ),
      ),
    );
    release.resolve();
    const late = await delayed;
    expect(late.isOk()).toBe(true);
    const successfulRetry = retries.find((result) => result.isOk());
    if (!successfulRetry) throw new Error("No successful retry");
    expect(late.toJSON()).toEqual(successfulRetry.toJSON());
    expect(writes).toHaveLength(7);
    const lost = await publishStory(
      { actor: { userId: lateActorId }, operationId: "lost-response", file },
      {
        ...dependencies,
        persistence: {
          ...dependencies.persistence,
          publish: async (input) => {
            await dependencies.persistence.publish(input);
            throw new Error("Committed response lost");
          },
        },
      },
    );
    expect(lost.isOk()).toBe(true);
    expect(
      (
        await readPublication(
          { actor: { userId: lateActorId }, operationId: "lost-response" },
          dependencies,
        )
      ).state,
    ).toBe("published");
    const controller = new AbortController();
    controller.abort();
    const cancelled = await publishStory(
      {
        actor: { userId: actorId },
        operationId: "cancelled",
        file: async () => {
          throw new Error("Cancelled read");
        },
        signal: controller.signal,
      },
      dependencies,
    );
    expect(cancelled.toJSON()).toMatchObject({
      tag: "Error",
      error: "UPLOAD_CANCELLED",
    });
  } finally {
    for (const ownedActor of [actorId, lateActorId])
      for (const name of Object.values(storyCollections))
        await database.apiDb
          .collection<{ _id: string; actorId?: string }>(name)
          .deleteMany(
            name === storyCollections.authors
              ? { _id: ownedActor }
              : { actorId: ownedActor },
          );
    await database.close();
  }
}, 30_000);
