import { expect, test } from "bun:test";
import { get } from "svelte/store";
import type { FeedPage } from "../../../domain/feed/types";
import { createStoryFeed } from "../../feed";
import { createStoryPlayer } from "../../playback";
import { createFeedRefresh } from "../refresh";

const page: FeedPage = {
  cursor: "older",
  authors: [
    {
      author: { id: "edd", username: "Edd" },
      latestPublishedAt: 10,
      stories: [
        {
          id: "one",
          author: { id: "edd", username: "Edd" },
          publishedAt: 10,
          expiresAt: 1000,
          durationMs: 100,
        },
      ],
    },
  ],
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("coincident refresh signals share one read and completion", async () => {
  const response = Promise.withResolvers<void>();
  const reads: number[] = [];
  const refresh = createFeedRefresh({
    refresh: () => {
      reads.push(reads.length);
      return response.promise;
    },
  });
  const first = refresh.request();
  const second = refresh.request();
  const third = refresh.request();
  await flush();
  expect(reads).toEqual([0]);
  response.resolve();
  await Promise.all([first, second, third]);
  expect(reads).toEqual([0]);
  refresh.dispose();
});

test("publication during a snapshot read receives a subsequent serialized read", async () => {
  const responses = [
    Promise.withResolvers<void>(),
    Promise.withResolvers<void>(),
  ];
  const reads: number[] = [];
  const refresh = createFeedRefresh({
    refresh: () => {
      const index = reads.length;
      reads.push(index);
      return responses[index]?.promise ?? Promise.resolve();
    },
  });
  const initial = refresh.request();
  await flush();
  const publication = refresh.request();
  const visibility = refresh.request();
  expect(reads).toEqual([0]);
  responses[0]?.resolve();
  await flush();
  expect(reads).toEqual([0, 1]);
  responses[1]?.resolve();
  await Promise.all([initial, publication, visibility]);
  expect(reads).toEqual([0, 1]);
  refresh.dispose();
});

test("disposal prevents a queued publication from reading after late completion", async () => {
  const response = Promise.withResolvers<void>();
  const reads: number[] = [];
  const refresh = createFeedRefresh({
    refresh: () => {
      reads.push(1);
      return response.promise;
    },
  });
  const initial = refresh.request();
  await flush();
  const publication = refresh.request();
  refresh.dispose();
  response.resolve();
  await Promise.all([initial, publication, refresh.request()]);
  expect(reads).toEqual([1]);
});

test("refresh invalidates an old pagination response and late disposal cannot restore it", async () => {
  const pagination = Promise.withResolvers<FeedPage>();
  const firstPage = Promise.withResolvers<FeedPage>();
  const disposedPage = Promise.withResolvers<FeedPage>();
  const signals: AbortSignal[] = [];
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    clock: { now: () => 100, schedule: () => () => {} },
    read: ({ cursor, signal }) => {
      signals.push(signal);
      if (cursor) return pagination.promise;
      if (signals.length === 2) return firstPage.promise;
      return disposedPage.promise;
    },
  });
  const old = feed.loadMore();
  const next = feed.refresh();
  firstPage.resolve({ authors: [], cursor: null });
  await next;
  pagination.resolve(page);
  await old;
  expect(signals[0]?.aborted).toBe(true);
  expect(get(feed.view).authors).toEqual([]);
  const late = feed.refresh();
  feed.dispose();
  disposedPage.resolve(page);
  await late;
  expect(signals.at(-1)?.aborted).toBe(true);
  expect(get(feed.view).authors).toEqual([]);
});

test("failed automatic refresh retains authors until local expiry and preserves error instead of empty", async () => {
  const timers = new Set<() => void>();
  const time = { now: 100 };
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    clock: {
      now: () => time.now,
      schedule: (operation) => {
        timers.add(operation);
        return () => {
          timers.delete(operation);
        };
      },
    },
    read: async () => {
      throw Error("offline");
    },
  });
  const refresh = createFeedRefresh({ refresh: feed.refresh });
  await refresh.request();
  expect(get(feed.view).kind).toBe("unavailable");
  expect(get(feed.view).authors.map((group) => group.author.username)).toEqual([
    "Edd",
  ]);
  time.now = 1000;
  for (const operation of [...timers]) operation();
  expect(get(feed.view).kind).toBe("unavailable");
  expect(get(feed.view).authors).toEqual([]);
  refresh.dispose();
  feed.dispose();
  expect(timers.size).toBe(0);
});

test("publication while an older feed read is pending becomes visible without replacing player selection", async () => {
  const snapshots = [
    Promise.withResolvers<FeedPage>(),
    Promise.withResolvers<FeedPage>(),
  ];
  const reads: number[] = [];
  const clock = { now: () => 100, schedule: () => () => {} };
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    clock,
    read: () => {
      const index = reads.length;
      reads.push(index);
      return (
        snapshots[index]?.promise ?? Promise.reject(Error("Unexpected read"))
      );
    },
  });
  const player = createStoryPlayer({
    clock,
    playback: async () => ({
      url: "https://fixture.test/one",
      expiresAt: 1000,
    }),
    preloader: { saveData: () => true, prepare: () => () => {} },
  });
  const selected = page.authors[0];
  if (!selected) throw Error("Missing author fixture");
  await player.open(selected);
  const refresh = createFeedRefresh({ refresh: feed.refresh });
  const initial = refresh.request();
  await flush();
  const publication = refresh.request();
  snapshots[0]?.resolve(page);
  await flush();
  await flush();
  expect(reads).toEqual([0, 1]);
  snapshots[1]?.resolve({
    cursor: null,
    authors: [
      {
        author: { id: "bob", username: "Bob" },
        latestPublishedAt: 200,
        stories: [
          {
            id: "new",
            author: { id: "bob", username: "Bob" },
            publishedAt: 200,
            expiresAt: 1500,
            durationMs: 100,
          },
        ],
      },
    ],
  });
  await Promise.all([initial, publication]);
  expect(get(feed.view).authors.map((group) => group.author.username)).toEqual([
    "Bob",
  ]);
  const playback = get(player.view);
  expect(playback.kind).toBe("ready");
  if (playback.kind !== "closed") expect(playback.story.id).toBe("one");
  refresh.dispose();
  feed.dispose();
  player.dispose();
});
