import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import type { StoryDependencies } from "../../../apps/be-insta/src/domains/stories/index";
import { createStoryPublisherLifetime } from "../../../apps/be-insta/src/domains/stories/use-cases/publisher";

const fixture = () => {
  const calls: Array<ReturnType<typeof Promise.withResolvers<void>>> = [];
  const entered = Promise.withResolvers<void>();
  const overflow = Promise.withResolvers<void>();
  const claims: string[] = [];
  const cancelled: string[] = [];
  const dependencies: StoryDependencies = {
    refreshFeed: async () => "refreshed",
    policy: {
      maxDurationMs: 15000,
      lifetimeMs: 86400000,
      maxFileBytes: 20971520,
      captureSafetyMarginMs: 200,
    },
    clock: Date.now,
    uuid: () => crypto.randomUUID(),
    activeProfile: "fixture",
    keyPrefix: "stories/",
    authors: {
      findPublicUser: async ({ id }) =>
        Result.Ok({ id, username: "synthetic" }),
    },
    uploads: {
      claim: async (claim) => {
        claims.push(claim.operationId);
        return { kind: "claimed", claim };
      },
      renew: async () => true,
      cancel: async ({ operationId }) => {
        cancelled.push(operationId);
      },
    },
    persistence: {
      read: async ({ operationId }) => ({ state: "pending", operationId }),
      findStory: async () => null,
      publish: async () => {
        throw new Error("Cancelled provider must not publish");
      },
    },
    storage: {
      putUnique: async ({ source }) => {
        expect((await new Response(source).arrayBuffer()).byteLength).toBe(1);
        const held = Promise.withResolvers<void>();
        calls.push(held);
        if (calls.length === 2) entered.resolve();
        if (calls.length > 2) overflow.resolve();
        await held.promise;
        return Result.Error("ABORTED");
      },
      read: async () => {
        throw new Error("Unexpected decoder read");
      },
      delete: async () => {
        throw new Error("Unknown effects must stay recoverable");
      },
      list: async () => ({ objects: [] }),
      signPlayback: () => {
        throw new Error("Unexpected playback");
      },
    },
    media: {
      inspect: async () => {
        throw new Error("Unexpected decoder entry");
      },
    },
  };
  const lifetime = createStoryPublisherLifetime(dependencies);
  const publish = (operationId: string, signal?: AbortSignal) =>
    lifetime.publish({
      operationId,
      actor: { userId: operationId },
      signal,
      file: async () => ({
        source: new Blob(["x"]).stream(),
        complete: Promise.resolve(),
      }),
    });
  return { ...lifetime, publish, calls, entered, overflow, claims, cancelled };
};

test("finite upload admission holds physical provider slots until actual settlement, including cancellation", async () => {
  const f = fixture();
  const controller = new AbortController();
  const first = f.publish("first", controller.signal);
  const second = f.publish("second");
  try {
    await f.entered.promise;
    const third = f.publish("third");
    const admission = await Promise.race([
      third.then((result) => result.toJSON()),
      f.overflow.promise.then(() => ({ admitted: true })),
    ]);
    expect(admission).toMatchObject({ tag: "Error", error: "BUSY" });
    expect(f.claims).toEqual(["first", "second"]);
    controller.abort();
    expect((await f.publish("after-cancel")).toJSON()).toMatchObject({
      tag: "Error",
      error: "BUSY",
    });
    expect(f.cancelled).toContain("first");
    f.calls[0]?.resolve();
    await first;
    const replacement = f.publish("replacement");
    await f.overflow.promise;
    expect(f.claims).toEqual(["first", "second", "replacement"]);
    f.calls[2]?.resolve();
    await replacement;
  } finally {
    for (const call of f.calls) call.resolve();
    await Promise.all([first, second]);
    await f.close();
  }
});

test("publisher shutdown rejects new work and waits for held provider settlement", async () => {
  const f = fixture();
  const first = f.publish("first");
  const second = f.publish("second");
  await f.entered.promise;
  let closed = false;
  const closing = f.close().then(() => {
    closed = true;
  });
  try {
    expect((await f.publish("after-close")).toJSON()).toMatchObject({
      tag: "Error",
      error: "UPLOAD_CANCELLED",
    });
    expect(closed).toBe(false);
    expect(f.cancelled).toContain("first");
    f.calls[0]?.resolve();
    await first;
    expect(closed).toBe(false);
    expect(f.cancelled).toContain("first");
  } finally {
    for (const call of f.calls) call.resolve();
    await Promise.all([first, second, closing]);
  }
  expect(closed).toBe(true);
  expect(new Set(f.cancelled)).toEqual(new Set(["first", "second"]));
});
