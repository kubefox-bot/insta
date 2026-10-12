import { expect, test } from "bun:test";
import { CommonErrorCode, StoryErrorCode } from "@insta/contracts/errors";
import type { StoryDependencies } from "../../../src/domains/stories/ports/persistence/interfaces";
import { playbackStory } from "../../../src/domains/stories/use-cases/playback";

test("playback signs each read for at most five minutes and never after expiry", async () => {
  const calls: number[] = [];
  const storage: StoryDependencies["storage"] = {
    signPlayback: ({ expiresAt }) => {
      calls.push(expiresAt);
      return {
        kind: "signed",
        url: `https://play.test/${calls.length}`,
        expiresAt,
      };
    },
    putUnique: async () => {
      throw new Error("No PUT");
    },
    read: async () => ({ kind: "missing" }),
    delete: async () => {},
    list: async () => ({ objects: [] }),
  };
  const run = (expiresAt: number) =>
    playbackStory("story", {
      clock: () => 1000,
      storage,
      persistence: {
        findStory: async () => ({
          story: {
            id: "story",
            author: { id: "a", username: "name" },
            publishedAt: 0,
            expiresAt,
            durationMs: 1000,
          },
          key: "private-key",
          profile: "private-profile",
        }),
        read: async () => {
          throw new Error("No status");
        },
        publish: async () => {
          throw new Error("No publication");
        },
      },
    });
  expect((await run(600000)).toJSON()).toMatchObject({
    tag: "Ok",
    value: { url: "https://play.test/1", expiresAt: 301000 },
  });
  expect((await run(2000)).toJSON()).toMatchObject({
    tag: "Ok",
    value: { url: "https://play.test/2", expiresAt: 2000 },
  });
  expect((await run(1000)).toJSON()).toMatchObject({
    tag: "Error",
    error: "STORY_NOT_FOUND",
  });
  expect(calls).toEqual([301000, 2000]);
});

test("playback distinguishes a dependency outage from an absent story", async () => {
  const result = await playbackStory("story", {
    clock: () => 1,
    persistence: {
      findStory: async () => {
        throw new Error("Mongo unavailable");
      },
      read: async () => {
        throw new Error("Unexpected read");
      },
      publish: async () => {
        throw new Error("Unexpected publish");
      },
    },
    storage: {
      signPlayback: () => {
        throw new Error("Unexpected sign");
      },
      putUnique: async () => {
        throw new Error("Unexpected put");
      },
      read: async () => ({ kind: "missing" }),
      delete: async () => {},
      list: async () => ({ objects: [] }),
    },
  });
  expect(result.toJSON()).toMatchObject({
    tag: "Error",
    error: "DEPENDENCY_UNAVAILABLE",
  });
});

/** Собирает изолированную историю с заданным остатком жизни и результатом внешней подписи. */
const expiryFixture = (
  storage: StoryDependencies["storage"]["signPlayback"],
  remainingMs: number,
) => {
  const nowMs = 1767225600000;
  const expiresAt = nowMs + remainingMs;
  return {
    expiresAt,
    dependencies: {
      clock: () => nowMs,
      storage: {
        signPlayback: storage,
        putUnique: async () => {
          throw Error("Unexpected put");
        },
        read: async () => ({ kind: "missing" as const }),
        delete: async () => {},
        list: async () => ({ objects: [] }),
      },
      persistence: {
        findStory: async () => ({
          story: {
            id: "story",
            author: { id: "a", username: "name" },
            publishedAt: nowMs - 1000,
            expiresAt,
            durationMs: 1000,
          },
          key: "stories/a.webm",
          profile: "local",
        }),
        read: async () => {
          throw Error("Unexpected read");
        },
        publish: async () => {
          throw Error("Unexpected publish");
        },
      },
    },
  };
};

for (const remainingMs of [0, 500, 999]) {
  test(`playback maps an exhausted ${remainingMs}ms signing window to absence`, async () => {
    const { dependencies } = expiryFixture(
      () => ({ kind: "expired" }),
      remainingMs,
    );
    const result = await playbackStory("story", dependencies);
    if (result.isOk()) throw Error("Expired playback unexpectedly signed");
    expect(result.getError()).toBe(StoryErrorCode.StoryNotFound);
  });
}

test("playback reports the actual signed deadline within the persisted story lifetime", async () => {
  const url = "https://play.test/a?X-Amz-Date=20260101T000000Z&X-Amz-Expires=1";
  const { dependencies, expiresAt } = expiryFixture(
    () => ({
      kind: "signed",
      url,
      expiresAt: 1767225601000,
    }),
    1500,
  );
  const result = await playbackStory("story", dependencies);
  expect(result.isOk()).toBe(true);
  if (result.isError()) throw Error(result.getError());
  const signed = result.get();
  expect(signed).toEqual({ url, expiresAt: 1767225601000 });
  expect(signed.expiresAt).toBeLessThanOrEqual(expiresAt);
});

test("playback preserves provider exceptions as dependency unavailable", async () => {
  const { dependencies } = expiryFixture(() => {
    throw Error("S3 unavailable");
  }, 1500);
  const result = await playbackStory("story", dependencies);
  if (result.isOk()) throw Error("Provider failure unexpectedly signed");
  expect(result.getError()).toBe(CommonErrorCode.DependencyUnavailable);
});
