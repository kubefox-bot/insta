import { expect } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { get } from "svelte/store";

type Server = typeof import("../../../apps/be-insta/src/domains/stories/index");
type Browser =
  typeof import("../../../apps/fe-insta/src/domains/stories/browser/state/index");
export const exerciseStories = async ({
  server,
  browser,
}: Readonly<{ server: Server; browser: Browser }>) => {
  const clockState = { now: 1000 };
  const timers = new Set<() => void>();
  const author = { id: "synthetic", username: "public" };
  const publishInput = {
    actor: { userId: author.id },
    operationId: "publish-operation",
    file: async () => ({
      source: new Blob(["x"]).stream(),
      complete: Promise.resolve(),
    }),
  };
  const published = await server.publishStory(publishInput, {
    refreshFeed: async () => "deferred",
    policy: {
      maxDurationMs: 15000,
      lifetimeMs: 86400000,
      maxFileBytes: 20971520,
      captureSafetyMarginMs: 200,
    },
    clock: () => clockState.now,
    uuid: () => crypto.randomUUID(),
    activeProfile: "isolated",
    keyPrefix: "owned/",
    authors: { findPublicUser: async () => Result.Ok(author) },
    uploads: {
      claim: async (claim) => ({ kind: "claimed", claim }),
      renew: async () => true,
      cancel: async () => {
        throw new Error("Unexpected cancellation");
      },
    },
    persistence: {
      read: async ({ operationId }) => ({ operationId, state: "pending" }),
      findStory: async () => null,
      publish: async (input) =>
        Result.Ok({
          id: input.storyId,
          author: input.author,
          publishedAt: input.now,
          expiresAt: input.expiresAt,
          durationMs: input.media.durationMs,
        }),
    },
    storage: {
      putUnique: async ({ profile, key, source }) =>
        Result.Ok({
          profile,
          key,
          byteLength: (await new Response(source).arrayBuffer()).byteLength,
        }),
      read: async () => ({ kind: "found", source: new Blob(["x"]).stream() }),
      delete: async () => {},
      list: async () => ({ objects: [] }),
      signPlayback: () => {
        throw new Error("Unexpected storage playback");
      },
    },
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
  });
  expect(published.isOk()).toBe(true);
  if (published.isError()) throw new Error(published.getError());
  const story = published.get();
  expect(story.expiresAt - story.publishedAt).toBe(86400000);
  const group = {
    author,
    latestPublishedAt: story.publishedAt,
    stories: [story],
  };
  const page = { authors: [group], cursor: null };
  const feedReader = server.createFeedReader({
    stories: { list: async () => page },
    cache: {
      read: async () => ({ version: "0", page: null }),
      fill: async () => true,
    },
    authors: { findPublicUser: async () => Result.Ok(author) },
    clock: () => clockState.now,
  });
  const initialFeed = await feedReader({ now: clockState.now });
  if (initialFeed.isError()) throw new Error(initialFeed.getError());
  expect(initialFeed.get().authors).toHaveLength(1);
  const clock = {
    now: () => clockState.now,
    schedule: (operation: () => void) => {
      timers.add(operation);
      return () => {
        timers.delete(operation);
      };
    },
  };
  const feed = browser.createStoryFeed({
    initial: { kind: "ready", page },
    read: async () => page,
    clock,
  });
  const player = browser.createStoryPlayer({
    playback: async () => ({
      url: "https://media.invalid/owned",
      expiresAt: story.expiresAt,
    }),
    clock,
    preloader: { saveData: () => true, prepare: () => () => {} },
  });
  await player.open(group);
  expect(get(player.view).kind).toBe("ready");
  clockState.now = story.expiresAt;
  for (const operation of [...timers]) operation();
  expect(get(player.view).kind).toBe("closed");
  expect(get(feed.view).kind).toBe("empty");
  const expiredFeed = await feedReader({ now: clockState.now });
  if (expiredFeed.isError()) throw new Error(expiredFeed.getError());
  expect(expiredFeed.get().authors).toEqual([]);
  feed.dispose();
  player.dispose();
  expect(timers.size).toBe(0);
  const revoked: string[] = [];
  const preview = browser.createStoryPreview({
    urls: {
      create: () => "blob:owned",
      revoke: (url) => {
        revoked.push(url);
      },
    },
  });
  const actor = { userId: author.id, generation: "generation" };
  preview.replace({ actor, blob: new Blob(["private"]) });
  preview.dispose();
  expect(preview.read(actor)).toBeUndefined();
  expect(revoked).toEqual(["blob:owned"]);
};
