import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import type { FeedPage } from "../../../apps/be-insta/src/domains/stories/domain/feed/types";
import { createFeedReader } from "../../../apps/be-insta/src/domains/stories/use-cases/list-feed";
import { requireFailure, requireSuccess } from "../../fixtures/outcome";

const page: FeedPage = {
  authors: [
    {
      author: { id: "a", username: "alice" },
      latestPublishedAt: 10,
      stories: [
        {
          id: "s",
          author: { id: "a", username: "alice" },
          publishedAt: 10,
          expiresAt: 100,
          durationMs: 10,
        },
      ],
    },
  ],
  cursor: null,
};
test("cached feed removes a story at exact expiry without requiring cache expiry", async () => {
  const read = createFeedReader({
    stories: {
      list: async () => {
        throw new Error("unexpected Mongo");
      },
    },
    authors: {
      findPublicUser: async ({ id }) => Result.Ok({ id, username: "alice" }),
    },
    cache: {
      read: async () => ({ version: "v1", page }),
      fill: async () => true,
    },
  });
  expect(requireSuccess(await read({ now: 100 })).authors).toEqual([]);
});
test("cache outage limits actual concurrent Mongo reads to four and never fabricates an empty page", async () => {
  const barrier = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  let calls = 0;
  const read = createFeedReader({
    stories: {
      list: async () => {
        calls++;
        if (calls === 4) entered.resolve();
        await barrier.promise;
        throw new Error("Mongo unavailable");
      },
    },
    authors: {
      findPublicUser: async ({ id }) => Result.Ok({ id, username: "alice" }),
    },
    cache: {
      read: async () => {
        throw new Error("cache unavailable");
      },
      fill: async () => true,
    },
  });
  const pending = Array.from({ length: 4 }, () => read({ now: 50 }));
  await entered.promise;
  expect(String(requireFailure(await read({ now: 50 })))).toBe("BUSY");
  expect(calls).toBe(4);
  barrier.resolve();
  expect(
    (await Promise.all(pending)).map((value) => requireFailure(value)),
  ).toEqual(Array(4).fill("DEPENDENCY_UNAVAILABLE"));
});
test("invalid cursors are rejected before provider calls", async () => {
  const read = createFeedReader({
    stories: {
      list: async () => {
        throw new Error("unexpected");
      },
    },
    authors: {
      findPublicUser: async ({ id }) => Result.Ok({ id, username: "alice" }),
    },
    cache: {
      read: async () => {
        throw new Error("unexpected");
      },
      fill: async () => true,
    },
  });
  expect(
    String(requireFailure(await read({ now: 1, cursor: "bad cursor" }))),
  ).toBe("INVALID_CURSOR");
});
