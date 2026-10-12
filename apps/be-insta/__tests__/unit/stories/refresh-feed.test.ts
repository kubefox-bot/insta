import { expect, test } from "bun:test";
import { createPublicationFeedRefresh } from "../../../src/domains/stories/use-cases/refresh-feed/create";

test("failed invalidation reports deferred and allows a later fresh attempt", async () => {
  const state = { failing: true, visibleVersion: "old" };
  const diagnostics: string[] = [];
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      if (state.failing) throw new Error("Redis unavailable");
      state.visibleVersion = "new";
    },
    onDeferred: () => diagnostics.push("deferred"),
  });
  const input = { actorId: "author", operationId: "failed-cache" };
  expect(await refresh.refresh(input)).toBe("deferred");
  expect(state.visibleVersion).toBe("old");
  expect(diagnostics).toEqual(["deferred"]);
  state.failing = false;
  expect(await refresh.refresh(input)).toBe("refreshed");
  expect(state.visibleVersion).toBe("new");
  await refresh.close();
});

test("an unavailable diagnostic sink preserves the deferred recovery outcome", async () => {
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      throw new Error("Redis unavailable");
    },
    onDeferred: () => {
      throw new Error("Diagnostic sink unavailable");
    },
  });
  const input = { actorId: "author", operationId: "sink-failure" };
  expect(await refresh.refresh(input)).toBe("deferred");
  await refresh.close();
  expect(await refresh.refresh(input)).toBe("deferred");
});

test("deadline returns deferred while shutdown retains ownership until SET settles", async () => {
  const entered = Promise.withResolvers<void>();
  const settlement = Promise.withResolvers<void>();
  const deadlines: Array<() => void> = [];
  const diagnostics: string[] = [];
  const state = { writes: 0, cancelledTimers: 0, closed: false };
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      state.writes++;
      entered.resolve();
      await settlement.promise;
    },
    onDeferred: () => diagnostics.push("deferred"),
    after: (callback) => {
      deadlines.push(callback);
      return () => {
        state.cancelledTimers++;
      };
    },
  });
  const input = { actorId: "author", operationId: "first" };
  const first = refresh.refresh(input);
  await entered.promise;
  deadlines[0]?.();
  expect(await first).toBe("deferred");
  expect(state.cancelledTimers).toBe(1);
  // A new commit cannot borrow an older SET as proof that its own feed is fresh.
  const second = refresh.refresh({ ...input, operationId: "second" });
  deadlines[1]?.();
  expect(await second).toBe("deferred");
  expect(state.writes).toBe(1);
  const closing = refresh.close().then(() => {
    state.closed = true;
  });
  await Promise.resolve();
  expect(state.closed).toBe(false);
  expect(await refresh.refresh({ ...input, operationId: "after-close" })).toBe(
    "deferred",
  );
  settlement.reject(new Error("Late Redis failure"));
  await closing;
  expect(state.closed).toBe(true);
  expect(diagnostics).toEqual(["deferred", "deferred", "deferred"]);
});

test("same-operation callers share their own pending SET and failed outcomes remain retryable", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const state = { attempts: 0 };
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      state.attempts++;
      if (state.attempts === 1) {
        entered.resolve();
        await release.promise;
        throw new Error("Redis acknowledgement lost");
      }
    },
    onDeferred: () => {},
  });
  const input = { actorId: "author", operationId: "same" };
  const first = refresh.refresh(input);
  await entered.promise;
  const repeat = refresh.refresh(input);
  release.resolve();
  expect(await first).toBe("deferred");
  expect(await repeat).toBe("deferred");
  expect(state.attempts).toBe(1);
  expect(await refresh.refresh(input)).toBe("refreshed");
  expect(state.attempts).toBe(2);
  await refresh.close();
});

test("recent-operation memory expires and evicts old identities without blocking a fresh SET", async () => {
  const state = { now: 0, effects: 0 };
  const refresh = createPublicationFeedRefresh({
    clock: () => state.now,
    invalidate: async () => {
      state.effects++;
    },
    onDeferred: () => {},
  });
  const first = { actorId: "author", operationId: "first" };
  await refresh.refresh(first);
  state.now = 86_400_000;
  await refresh.refresh(first);
  expect(state.effects).toBe(2);
  for (let index = 0; index < 1024; index++)
    await refresh.refresh({ actorId: "author", operationId: `next-${index}` });
  const beforeEvictedRetry = state.effects;
  await refresh.refresh(first);
  expect(state.effects).toBe(beforeEvictedRetry + 1);
  await refresh.close();
});

test("pending queue is bounded and owns each accepted effect until shutdown settlement", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const state = { effects: 0 };
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      state.effects++;
      if (state.effects === 1) {
        entered.resolve();
        await release.promise;
      }
    },
    onDeferred: () => {},
  });
  const pending = Array.from({ length: 32 }, (_, index) =>
    refresh.refresh({ actorId: "author", operationId: `queued-${index}` }),
  );
  await entered.promise;
  expect(
    await refresh.refresh({ actorId: "author", operationId: "overflow" }),
  ).toBe("deferred");
  expect(state.effects).toBe(1);
  release.resolve();
  expect(await Promise.all(pending)).toEqual(
    Array.from({ length: 32 }, () => "refreshed"),
  );
  expect(state.effects).toBe(32);
  await refresh.close();
});

test("a concurrent distinct commit queues its own invalidation before confirming refresh", async () => {
  const entered = Promise.withResolvers<void>();
  const settlement = Promise.withResolvers<void>();
  const state = { effects: 0 };
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      state.effects++;
      if (state.effects === 1) {
        entered.resolve();
        await settlement.promise;
      }
    },
    onDeferred: () => {},
  });
  const first = refresh.refresh({ actorId: "author", operationId: "first" });
  await entered.promise;
  const second = refresh.refresh({ actorId: "author", operationId: "second" });
  expect(state.effects).toBe(1);
  settlement.resolve();
  expect(await first).toBe("refreshed");
  expect(await second).toBe("refreshed");
  expect(state.effects).toBe(2);
  await refresh.close();
});

test("repeated confirmed status for one operation does not churn the global feed version", async () => {
  const state = { versions: 0 };
  const refresh = createPublicationFeedRefresh({
    invalidate: async () => {
      state.versions++;
    },
    onDeferred: () => {},
  });
  const input = { actorId: "author", operationId: "committed" };
  expect(await refresh.refresh(input)).toBe("refreshed");
  expect(await refresh.refresh(input)).toBe("refreshed");
  expect(state.versions).toBe(1);
  expect(await refresh.refresh({ ...input, actorId: "other" })).toBe(
    "refreshed",
  );
  expect(state.versions).toBe(2);
  await refresh.close();
});
