import { expect, test } from "bun:test";
import * as stories from "../../../apps/fe-insta/src/domains/stories/browser/index";

test("public Stories API offers per-instance feed and player ownership", () => {
  expect(Object.hasOwn(stories, "createStoryFeed")).toBe(true);
  expect(Object.hasOwn(stories, "createStoryPlayer")).toBe(true);
});

import { get } from "svelte/store";
import {
  createStoryFeed,
  createStoryPlayer,
  type FeedPage,
} from "../../../apps/fe-insta/src/domains/stories/browser/index";

const clockFixture = () => {
  const state = { now: 1000 };
  const timers = new Map<() => void, number>();
  return {
    clock: {
      now: () => state.now,
      schedule: (operation: () => void, delayMs: number) => {
        timers.set(operation, state.now + delayMs);
        return () => {
          timers.delete(operation);
        };
      },
    },
    advance: async (now: number) => {
      state.now = now;
      for (const [operation, deadline] of [...timers])
        if (deadline <= now) {
          timers.delete(operation);
          operation();
        }
      await Promise.resolve();
      await Promise.resolve();
    },
    timers,
  };
};
const author = { id: "author-1", username: "PublicAuthor" };
const page: FeedPage = {
  authors: [
    {
      author,
      latestPublishedAt: 800,
      stories: [
        {
          id: "first",
          author,
          publishedAt: 700,
          expiresAt: 4000,
          durationMs: 1000,
        },
        {
          id: "second",
          author,
          publishedAt: 800,
          expiresAt: 5000,
          durationMs: 1000,
        },
      ],
    },
  ],
  cursor: "page-two",
};

test("hydration uses the public snapshot without reading and removes locally expired authors", async () => {
  const fixture = clockFixture();
  const reads: string[] = [];
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    clock: fixture.clock,
    read: async ({ cursor }) => {
      reads.push(cursor ?? "initial");
      return page;
    },
  });
  expect(get(feed.view).kind).toBe("ready");
  expect(get(feed.view).authors[0]?.author).toEqual(author);
  expect(reads).toEqual([]);
  await fixture.advance(4000);
  expect(get(feed.view).authors[0]?.stories.map((story) => story.id)).toEqual([
    "second",
  ]);
  await fixture.advance(5000);
  expect(get(feed.view).kind).toBe("empty");
  feed.dispose();
  expect(fixture.timers.size).toBe(0);
});

test("unavailable is distinct from empty and explicit retry can recover", async () => {
  const fixture = clockFixture();
  const feed = createStoryFeed({
    initial: { kind: "unavailable" },
    clock: fixture.clock,
    read: async () => ({ authors: [], cursor: null }),
  });
  expect(get(feed.view).kind).toBe("unavailable");
  await feed.refresh();
  expect(get(feed.view).kind).toBe("empty");
  feed.dispose();
});

test("pagination merges duplicate stories; failed reads retain public authors and expose retry", async () => {
  const fixture = clockFixture();
  const requests: (string | null)[] = [];
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    clock: fixture.clock,
    read: async ({ cursor }) => {
      requests.push(cursor);
      if (cursor === null) throw new Error("network failure");
      return { ...page, cursor: null };
    },
  });
  await feed.loadMore();
  expect(requests).toEqual(["page-two"]);
  expect(get(feed.view).authors[0]?.stories).toHaveLength(2);
  await feed.refresh();
  expect(get(feed.view).kind).toBe("unavailable");
  expect(get(feed.view).authors).toHaveLength(1);
  feed.dispose();
});

test("superseded and disposed feed reads abort and cannot replace the current snapshot", async () => {
  const fixture = clockFixture();
  const pending = Promise.withResolvers<FeedPage>();
  const signals: AbortSignal[] = [];
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    clock: fixture.clock,
    read: async ({ signal }) => {
      signals.push(signal);
      return signals.length === 1
        ? pending.promise
        : { authors: [], cursor: null };
    },
  });
  const old = feed.refresh();
  await feed.refresh();
  expect(signals[0]?.aborted).toBe(true);
  pending.resolve(page);
  await old;
  expect(get(feed.view).kind).toBe("empty");
  const last = feed.refresh();
  feed.dispose();
  await last;
  expect(signals.at(-1)?.aborted).toBe(true);
  expect(fixture.timers.size).toBe(0);
});

test("player initially loads only selected video, navigates within author and closes after last", async () => {
  const fixture = clockFixture();
  const ids: string[] = [];
  const prepared: string[] = [];
  const player = createStoryPlayer({
    clock: fixture.clock,
    playback: async ({ id }) => {
      ids.push(id);
      return { url: `https://media.test/${id}`, expiresAt: 3500 };
    },
    preloader: {
      saveData: () => false,
      prepare: (url) => {
        prepared.push(url);
        return () => {};
      },
    },
  });
  const group = page.authors[0];
  if (!group) throw new Error("fixture author missing");
  await player.open(group);
  expect(ids).toEqual(["first"]);
  expect(prepared).toEqual([]);
  expect(get(player.view).kind).toBe("ready");
  await player.next();
  expect(ids).toEqual(["first", "second"]);
  await player.previous();
  expect(ids.at(-1)).toBe("first");
  await player.next();
  await player.next();
  expect(get(player.view).kind).toBe("closed");
  expect(fixture.timers.size).toBe(0);
});

test("next preparation never plays, respects data saver, and releases on replacement and close", async () => {
  const fixture = clockFixture();
  const owned = new Set<string>();
  const state = { saveData: false };
  const player = createStoryPlayer({
    clock: fixture.clock,
    playback: async ({ id }) => ({
      url: `https://media.test/${id}`,
      expiresAt: 3500,
    }),
    preloader: {
      saveData: () => state.saveData,
      prepare: (url) => {
        owned.add(url);
        return () => {
          owned.delete(url);
        };
      },
    },
  });
  const group = page.authors[0];
  if (!group) throw new Error("fixture author missing");
  await player.open(group);
  state.saveData = true;
  await player.prepareNext();
  expect(owned.size).toBe(0);
  state.saveData = false;
  await player.prepareNext();
  expect([...owned]).toEqual(["https://media.test/second"]);
  await player.next();
  expect(owned.size).toBe(0);
  await player.previous();
  await player.prepareNext();
  player.close();
  expect(owned.size).toBe(0);
});

test("URL expiry refreshes selected playback, story expiry closes even with loaded bytes", async () => {
  const fixture = clockFixture();
  const ids: string[] = [];
  const player = createStoryPlayer({
    clock: fixture.clock,
    playback: async ({ id }) => {
      ids.push(id);
      return {
        url: `https://media.test/${ids.length}`,
        expiresAt: Math.min(fixture.clock.now() + 500, 4000),
      };
    },
    preloader: { saveData: () => false, prepare: () => () => {} },
  });
  const group = page.authors[0];
  if (!group) throw new Error("fixture author missing");
  await player.open(group);
  await fixture.advance(1500);
  expect(ids).toEqual(["first", "first"]);
  expect(get(player.view).kind).toBe("ready");
  await fixture.advance(4000);
  expect(get(player.view).kind).toBe("closed");
});

test("late selected/prepared URL cannot reopen closed player or acquire a media resource", async () => {
  const fixture = clockFixture();
  const pending = Promise.withResolvers<{ url: string; expiresAt: number }>();
  const signals: AbortSignal[] = [];
  const owned = new Set<string>();
  const player = createStoryPlayer({
    clock: fixture.clock,
    playback: async ({ signal, id }) => {
      signals.push(signal);
      return id === "first"
        ? { url: "https://media.test/first", expiresAt: 3500 }
        : pending.promise;
    },
    preloader: {
      saveData: () => false,
      prepare: (url) => {
        owned.add(url);
        return () => {
          owned.delete(url);
        };
      },
    },
  });
  const group = page.authors[0];
  if (!group) throw new Error("fixture author missing");
  await player.open(group);
  const preparing = player.prepareNext();
  player.close();
  pending.resolve({ url: "https://media.test/second", expiresAt: 3500 });
  await preparing;
  expect(signals.at(-1)?.aborted).toBe(true);
  expect(owned.size).toBe(0);
  expect(get(player.view).kind).toBe("closed");
  player.dispose();
  expect(fixture.timers.size).toBe(0);
});

test("public HTTP transport is available without server SDK or session ownership", () => {
  expect(Object.hasOwn(stories, "createStoryTransport")).toBe(true);
});

import { createStoryTransport } from "../../../apps/fe-insta/src/domains/stories/browser/index";

test("public response boundary rejects private fields, impossible dates and non-media URLs", async () => {
  const responses = [
    {
      ok: true,
      data: {
        ...page,
        authors: page.authors.map((group) => ({
          ...group,
          author: { ...group.author, email: "private@example.test" },
        })),
      },
      meta: { requestId: "public" },
    },
    {
      ok: true,
      data: {
        authors: page.authors.map((group) => ({
          ...group,
          stories: group.stories.map((story) => ({
            ...story,
            expiresAt: story.publishedAt - 1,
          })),
        })),
        cursor: null,
      },
      meta: { requestId: "public" },
    },
  ];
  for (const body of responses) {
    const transport = createStoryTransport({
      request: async () => Response.json(body),
      feedPath: "/feed",
      playbackPath: (id) => `/playback/${id}`,
    });
    await expect(
      transport.read({ cursor: null, signal: new AbortController().signal }),
    ).rejects.toThrow();
  }
  const transport = createStoryTransport({
    request: async () =>
      Response.json({
        ok: true,
        data: { url: "javascript:alert(1)", expiresAt: 3000 },
        meta: { requestId: "public" },
      }),
    feedPath: "/feed",
    playbackPath: (id) => `/playback/${id}`,
  });
  await expect(
    transport.playback({ id: "first", signal: new AbortController().signal }),
  ).rejects.toThrow();
});

test("public HTTP adapter retains cancellation, encoded cursor and explicitly distinguishes failed service", async () => {
  const requests: { path: string; signal: AbortSignal | null | undefined }[] =
    [];
  const signal = new AbortController().signal;
  const transport = createStoryTransport({
    request: async (input, init) => {
      requests.push({ path: String(input), signal: init?.signal });
      return Response.json({
        ok: true,
        data: page,
        meta: { requestId: "public" },
      });
    },
    feedPath: "/feed",
    playbackPath: (id) => `/playback/${encodeURIComponent(id)}`,
  });
  expect(await transport.read({ cursor: "private/?next", signal })).toEqual(
    page,
  );
  expect(requests).toEqual([
    { path: "/feed?cursor=private%2F%3Fnext", signal },
  ]);
  const failed = createStoryTransport({
    request: async () => new Response("down", { status: 503 }),
    feedPath: "/feed",
    playbackPath: (id) => id,
  });
  await expect(failed.read({ cursor: null, signal })).rejects.toThrow();
});

test("navigation accepts a fresh SSR snapshot without another read and fences an older pending refresh", async () => {
  const fixture = clockFixture();
  const pending = Promise.withResolvers<FeedPage>();
  const feed = createStoryFeed({
    initial: { kind: "ready", page },
    clock: fixture.clock,
    read: async () => pending.promise,
  });
  const refresh = feed.refresh();
  expect("reconcile" in feed).toBe(true);
  if (!("reconcile" in feed) || typeof feed.reconcile !== "function") return;
  feed.reconcile({ kind: "ready", page: { authors: [], cursor: null } });
  pending.resolve(page);
  await refresh;
  expect(get(feed.view).kind).toBe("empty");
  feed.dispose();
});
