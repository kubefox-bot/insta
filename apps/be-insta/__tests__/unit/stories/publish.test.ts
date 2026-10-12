import { describe, expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import type { FeedPage } from "../../../src/domains/stories/domain/feed/types";
import type { PublicationStatus } from "../../../src/domains/stories/domain/types";
import type { StoryDependencies } from "../../../src/domains/stories/ports/persistence/interfaces";
import { createFeedReader } from "../../../src/domains/stories/use-cases/list-feed";
import { publishStory } from "../../../src/domains/stories/use-cases/publish";
import { readPublication } from "../../../src/domains/stories/use-cases/read-publication";
import { createPublicationFeedRefresh } from "../../../src/domains/stories/use-cases/refresh-feed/create";

const setup = () => {
  const records = new Map<string, PublicationStatus>();
  const accounting: string[] = [];
  const effects: string[] = [];
  const cached = { page: null as FeedPage | null, version: "initial" };
  const refreshFeed = async () => {
    cached.version = crypto.randomUUID();
    cached.page = null;
    return "refreshed" as const;
  };
  const dependencies: StoryDependencies = {
    refreshFeed,
    policy: {
      maxDurationMs: 15000,
      lifetimeMs: 86400000,
      maxFileBytes: 20971520,
      captureSafetyMarginMs: 200,
    },
    keyPrefix: "stories/",
    activeProfile: "private",
    clock: () => 1000,
    uuid: () => crypto.randomUUID(),
    authors: {
      findPublicUser: async ({ id }) => Result.Ok({ id, username: "alice" }),
    },
    uploads: {
      claim: async (input) => {
        const key = `${input.actorId}:${input.operationId}`;
        const prior = records.get(key);
        if (prior) return { kind: "existing", status: prior };
        records.set(key, { state: "pending", operationId: input.operationId });
        accounting.push(input.key);
        return { kind: "claimed", claim: input };
      },
      renew: async () => true,
      cancel: async (input) => {
        const key = `${input.actorId}:${input.operationId}`;
        if (records.get(key)?.state === "pending")
          records.set(key, {
            state: "failed",
            operationId: input.operationId,
            code: input.code,
          });
      },
    },
    persistence: {
      read: async ({ actorId, operationId }) =>
        records.get(`${actorId}:${operationId}`) ?? {
          state: "not_found",
          operationId,
        },
      findStory: async () => null,
      publish: async (input) => {
        const key = `${input.claim.actorId}:${input.claim.operationId}`;
        if (
          [...records.values()].filter((r) => r.state === "published").length >=
          5
        )
          return Result.Error(StoryErrorCode.ActiveLimit);
        if (records.get(key)?.state !== "pending")
          return Result.Error(StoryErrorCode.UploadCancelled);
        const story = {
          id: input.storyId,
          author: input.author,
          publishedAt: input.now,
          expiresAt: input.expiresAt,
          durationMs: input.media.durationMs,
        };
        records.set(key, {
          state: "published",
          operationId: input.claim.operationId,
          story,
        });
        return Result.Ok(story);
      },
    },
    storage: {
      putUnique: async (input) => {
        expect(accounting).toContain(input.key);
        effects.push(input.key);
        await new Response(input.source).arrayBuffer();
        return Result.Ok({
          profile: input.profile,
          key: input.key,
          byteLength: 3,
        });
      },
      read: async () => ({
        kind: "found",
        source: new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1]));
            c.close();
          },
        }),
      }),
      delete: async () => {
        throw new Error("Publication must retain uncertain objects");
      },
      signPlayback: ({ expiresAt }) => ({
        kind: "signed",
        url: "https://signed",
        expiresAt,
      }),
      list: async () => ({ objects: [] }),
    },
    media: {
      inspect: async () =>
        Result.Ok({
          container: "mp4",
          videoCodec: "h264",
          audioCodec: "aac",
          durationMs: 1234,
        }),
    },
  };
  const file = async () => ({
    source: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        c.close();
      },
    }),
    complete: Promise.resolve(),
  });
  const publication = { ...dependencies, refreshFeed };
  const feed = createFeedReader({
    stories: {
      list: async () => {
        const stories = [...records.values()].flatMap((status) =>
          status.state === "published" ? [status.story] : [],
        );
        return {
          authors: stories.length
            ? [
                {
                  author: { id: "actor", username: "alice" },
                  latestPublishedAt: 1000,
                  stories,
                },
              ]
            : [],
          cursor: null,
        };
      },
    },
    authors: publication.authors,
    cache: {
      read: async () => ({ ...cached }),
      fill: async ({ version, page }) => {
        if (version !== cached.version) return false;
        cached.page = page;
        return true;
      },
    },
  });
  return { dependencies: publication, file, effects, records, feed, cached };
};

test("confirmed publication is visible in an immediately refreshed warmed feed", async () => {
  const { dependencies, file, feed, cached } = setup();
  expect((await feed({ now: 1000 })).toJSON()).toMatchObject({
    tag: "Ok",
    value: { authors: [] },
  });
  expect(cached.page?.authors).toEqual([]);
  const result = await publishStory(
    { actor: { userId: "actor" }, operationId: "warm-feed", file },
    dependencies,
  );
  if (result.isError()) throw new Error(result.getError());
  expect((await feed({ now: 1000 })).toJSON()).toMatchObject({
    tag: "Ok",
    value: {
      authors: [
        { author: { id: "actor" }, stories: [{ id: result.get().id }] },
      ],
    },
  });
});

for (const confirmation of ["replay", "status", "commit-readback"] as const) {
  test(`${confirmation} confirmation makes the committed story visible without uploading again`, async () => {
    const { dependencies, file, feed, effects } = setup();
    await feed({ now: 1000 });
    const input = {
      actor: { userId: "actor" },
      operationId: confirmation,
      file,
    };
    if (confirmation === "commit-readback") {
      const result = await publishStory(input, {
        ...dependencies,
        persistence: {
          ...dependencies.persistence,
          publish: async (publication) => {
            await dependencies.persistence.publish(publication);
            throw new Error("Committed response lost");
          },
        },
      });
      expect(result.isOk()).toBe(true);
    } else {
      const initial = await publishStory(input, {
        ...dependencies,
        refreshFeed: async () => "deferred" as const,
      });
      expect(initial.isOk()).toBe(true);
      expect((await feed({ now: 1000 })).toJSON()).toMatchObject({
        tag: "Ok",
        value: { authors: [] },
      });
      if (confirmation === "status") {
        expect((await readPublication(input, dependencies)).state).toBe(
          "published",
        );
      } else {
        expect(
          (
            await publishStory(
              {
                ...input,
                file: async () => {
                  throw new Error("Replay must not upload");
                },
              },
              dependencies,
            )
          ).isOk(),
        ).toBe(true);
      }
    }
    expect((await feed({ now: 1000 })).toJSON()).toMatchObject({
      tag: "Ok",
      value: {
        authors: [{ author: { id: "actor" }, stories: [{ durationMs: 1234 }] }],
      },
    });
    expect(effects).toHaveLength(1);
  });
}

test("cache failure preserves the committed identity for replay and status recovery", async () => {
  const { dependencies, file, records, effects, feed } = setup();
  const diagnostics: string[] = [];
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      throw new Error("Redis unavailable");
    },
    onDeferred: () => diagnostics.push("deferred"),
  });
  const publication = { ...dependencies, refreshFeed: refresh.refresh };
  const input = {
    actor: { userId: "actor" },
    operationId: "cache-failure",
    file,
  };
  await feed({ now: 1000 });
  const committed = await publishStory(input, publication);
  expect(committed.isOk()).toBe(true);
  expect(records.get("actor:cache-failure")?.state).toBe("published");
  const replay = await publishStory(
    {
      ...input,
      file: async () => {
        throw new Error("Replay must not upload");
      },
    },
    publication,
  );
  expect(replay.toJSON()).toEqual(committed.toJSON());
  expect((await readPublication(input, publication)).state).toBe("published");
  expect(effects).toHaveLength(1);
  expect(diagnostics).toEqual(["deferred", "deferred", "deferred"]);
  await refresh.close();
});

test("repeated published status uses one confirmed feed invalidation while a new operation refreshes again", async () => {
  const { dependencies, file, feed, cached } = setup();
  const state = { cacheWrites: 0 };
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      state.cacheWrites++;
      await dependencies.refreshFeed();
    },
    onDeferred: () => {
      throw new Error("Healthy cache must not defer");
    },
  });
  const publication = { ...dependencies, refreshFeed: refresh.refresh };
  const input = {
    actor: { userId: "actor" },
    operationId: "repeated-status",
    file,
  };
  try {
    await feed({ now: 1000 });
    expect((await publishStory(input, publication)).isOk()).toBe(true);
    const version = cached.version;
    for (const _ of [1, 2, 3])
      expect((await readPublication(input, publication)).state).toBe(
        "published",
      );
    expect(cached.version).toBe(version);
    expect(state.cacheWrites).toBe(1);
    expect(
      (
        await publishStory(
          { ...input, operationId: "new-operation" },
          publication,
        )
      ).isOk(),
    ).toBe(true);
    expect(state.cacheWrites).toBe(2);
  } finally {
    await refresh.close();
  }
});
describe("accounted publication", () => {
  test("concurrent repeats read the file once and recover the committed story", async () => {
    const { dependencies, file, effects } = setup();
    const input = { actor: { userId: "actor" }, operationId: "op", file };
    const results = await Promise.all([
      publishStory(input, dependencies),
      publishStory(input, dependencies),
    ]);
    expect(results.filter((r) => r.isOk())).toHaveLength(1);
    const replay = await publishStory(
      {
        ...input,
        file: async () => {
          throw new Error("replay read");
        },
      },
      dependencies,
    );
    expect(replay.isOk()).toBe(true);
    expect(effects).toHaveLength(1);
    if (replay.isError()) throw new Error(replay.getError());
    expect(replay.get().durationMs).toBe(1234);
    expect(
      (
        await readPublication(
          { actor: { userId: "other" }, operationId: "op" },
          dependencies,
        )
      ).state,
    ).toBe("not_found");
  });
  test("six concurrent publishes retain at most five active results", async () => {
    const { dependencies, file } = setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        publishStory(
          { actor: { userId: "actor" }, operationId: `op${i}`, file },
          dependencies,
        ),
      ),
    );
    expect(results.filter((r) => r.isOk())).toHaveLength(5);
    expect(String(results.find((r) => r.isError())?.getError())).toBe(
      "ACTIVE_LIMIT",
    );
  });
  test("preclaim not_found and late duplicate preserve one canonical effect", async () => {
    const { dependencies, file, effects } = setup();
    expect(
      (
        await readPublication(
          { actor: { userId: "actor" }, operationId: "late" },
          dependencies,
        )
      ).state,
    ).toBe("not_found");
    await publishStory(
      { actor: { userId: "actor" }, operationId: "late", file },
      dependencies,
    );
    await Promise.all(
      [1, 2].map(() =>
        publishStory(
          { actor: { userId: "actor" }, operationId: "late", file },
          dependencies,
        ),
      ),
    );
    expect(effects).toHaveLength(1);
  });
  test("unknown storage effects keep accounting and never delete", async () => {
    const { dependencies, file, records } = setup();
    const failing = {
      ...dependencies,
      storage: {
        ...dependencies.storage,
        putUnique: async () => {
          throw new Error("lost PUT response");
        },
      },
    };
    const result = await publishStory(
      { actor: { userId: "actor" }, operationId: "unknown", file },
      failing,
    );
    if (result.isOk()) throw new Error("Expected uncertain result");
    expect(String(result.getError())).toBe("OPERATION_OUTCOME_UNKNOWN");
    expect(records.get("actor:unknown")?.state).toBe("failed");
  });
});

test("published winner survives an abort after commit", async () => {
  const { dependencies, file } = setup();
  const controller = new AbortController();
  const real = dependencies.persistence.publish;
  const publication = {
    ...dependencies,
    persistence: {
      ...dependencies.persistence,
      publish: async (input: Parameters<typeof real>[0]) => {
        const result = await real(input);
        controller.abort();
        return result;
      },
    },
  };
  const result = await publishStory(
    {
      actor: { userId: "actor" },
      operationId: "committed-abort",
      file,
      signal: controller.signal,
    },
    publication,
  );
  expect(result.isOk()).toBe(true);
  expect(
    (
      await readPublication(
        { actor: { userId: "actor" }, operationId: "committed-abort" },
        dependencies,
      )
    ).state,
  ).toBe("published");
});

test("acknowledged winner survives unavailable cancellation acknowledgement", async () => {
  const { dependencies, file } = setup();
  const controller = new AbortController();
  const persist = dependencies.persistence.publish;
  const publication = {
    ...dependencies,
    uploads: {
      ...dependencies.uploads,
      cancel: async () => {
        throw new Error("Mongo cancellation response lost");
      },
    },
    persistence: {
      ...dependencies.persistence,
      publish: async (input: Parameters<typeof persist>[0]) => {
        const result = await persist(input);
        controller.abort();
        return result;
      },
    },
  };
  const result = await publishStory(
    {
      actor: { userId: "actor" },
      operationId: "winner",
      file,
      signal: controller.signal,
    },
    publication,
  );
  expect(result.isOk()).toBe(true);
});

test("unknown durable claim never reads the file", async () => {
  const { dependencies } = setup();
  const result = await publishStory(
    {
      actor: { userId: "actor" },
      operationId: "claim-unknown",
      file: async () => {
        throw new Error("Must not read file");
      },
    },
    {
      ...dependencies,
      uploads: {
        ...dependencies.uploads,
        claim: async () => {
          throw new Error("lost claim acknowledgement");
        },
      },
    },
  );
  expect(result.toJSON()).toMatchObject({
    tag: "Error",
    error: "OPERATION_OUTCOME_UNKNOWN",
  });
});

test("runtime policy governs new uploads and publication expiry while replay keeps old media", async () => {
  const { dependencies, file } = setup();
  const original: StoryDependencies = {
    ...dependencies,
    policy: { ...dependencies.policy, lifetimeMs: 3000000000 },
    media: {
      inspect: async ({
        maxDurationMs,
      }: Parameters<StoryDependencies["media"]["inspect"]>[0]) =>
        maxDurationMs >= 14000
          ? Result.Ok({
              container: "mp4" as const,
              videoCodec: "h264" as const,
              audioCodec: "aac" as const,
              durationMs: 14000,
            })
          : Result.Error(StoryErrorCode.TooLong),
    },
  };
  const input = {
    actor: { userId: "actor" },
    operationId: "policy-original",
    file,
  };
  const published = await publishStory(input, original);
  expect(published.toJSON()).toMatchObject({
    tag: "Ok",
    value: { durationMs: 14000, publishedAt: 1000, expiresAt: 3000001000 },
  });
  const reduced: StoryDependencies = {
    ...original,
    media: {
      inspect: async ({ maxDurationMs }) =>
        maxDurationMs >= 11000
          ? Result.Ok({
              container: "mp4",
              videoCodec: "h264",
              audioCodec: "aac",
              durationMs: 11000,
            })
          : Result.Error(StoryErrorCode.TooLong),
    },
    policy: { ...original.policy, maxDurationMs: 10000, lifetimeMs: 1000 },
  };
  expect((await publishStory(input, reduced)).toJSON()).toEqual(
    published.toJSON(),
  );
  expect(
    (
      await publishStory({ ...input, operationId: "policy-new" }, reduced)
    ).toJSON(),
  ).toMatchObject({ tag: "Error", error: "TOO_LONG" });
});

test("a clock jump cannot persist expiry outside supported Date range", async () => {
  const { dependencies, file, records } = setup();
  const result = await publishStory(
    { actor: { userId: "actor" }, operationId: "date-overflow", file },
    { ...dependencies, clock: () => 8640000000000000 - 1000 },
  );
  expect(result.toJSON()).toMatchObject({
    tag: "Error",
    error: "DEPENDENCY_UNAVAILABLE",
  });
  expect(records.get("actor:date-overflow")?.state).toBe("failed");
});
