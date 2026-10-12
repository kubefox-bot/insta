import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { get } from "svelte/store";
import {
  memoryQueue,
  readRecords,
} from "../../../apps/fe-insta/__tests__/fixtures/outbox/memory";
import { createOutboxAuth } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/auth";
import { createOutbox } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/store";
import { createLogoutLifecycle } from "../../../apps/fe-insta/src/domains/users/browser/logout-lifecycle";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";

for (const outcome of ["success", "failure", "rejection"] as const) {
  test(`logout ${outcome} retains its asynchronous queue resource while runtime retires`, async () => {
    const actor = { userId: "owner", username: "owner", generation: "g1" };
    const auth = createAuthBrowser({
      initial: { actor, status: "authenticated" },
      read: async () => null,
      clearPrivate: () => {},
      synchronization: {
        exclusive: async (run) => run(),
        publish: () => {},
        subscribe: () => () => {},
      },
    });
    const base = memoryQueue();
    const release = Promise.withResolvers<void>();
    const state = {
      started: false,
      closed: false,
      closes: 0,
      changesClosed: false,
    };
    const outbox = createOutbox({
      queue: {
        ...base,
        clear: async (ownerId) => {
          state.started = true;
          await release.promise;
          // Enforce the real IndexedDB provider lifetime instead of a no-op close.
          if (state.closed || outcome === "failure")
            return Result.Error("PERSISTENCE_FAILED");
          if (outcome === "rejection")
            throw new Error("Owned provider rejected clear");
          return base.clear(ownerId);
        },
        close: () => {
          state.closed = true;
          state.closes++;
        },
      },
      auth: createOutboxAuth(auth, {
        online: () => false,
        offlineEvents: new EventTarget(),
      }),
      sender: async () => ({ kind: "unknown" }),
      locks: { run: async (_owner, run) => run() },
      changes: {
        publish: () => {
          if (state.changesClosed)
            throw new Error("Changes closed before clear settled");
        },
        subscribe: () => () => {},
        close: () => {
          state.changesClosed = true;
        },
      },
    });
    const releaseIdentity = auth.view.subscribe((view) => {
      if (view.status === "pending") queueMicrotask(() => outbox.dispose());
    });
    const queued = await outbox.enqueue({
      conversationId: "a".repeat(24),
      text: "Owned durable draft",
    });
    expect(queued.isOk()).toBe(true);
    const clearing = Promise.resolve(auth.beginLogout()).then(
      () => "cleared",
      () => "failed",
    );
    try {
      expect(get(auth.view)).toEqual({ actor: null, status: "pending" });
      expect(state.started).toBe(true);
      // Observable runtime disposal barrier, not a timer or timing retry.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(state.closed).toBe(false);
      expect(get(outbox.view)).toEqual({
        ownerId: null,
        records: [],
        busy: false,
      });
      release.resolve();
      expect(await clearing).toBe(outcome === "success" ? "cleared" : "failed");
      expect(state.closed).toBe(true);
      expect(state.closes).toBe(1);
      expect(state.changesClosed).toBe(true);
      expect(await readRecords(base)).toHaveLength(
        outcome === "success" ? 0 : 1,
      );
      expect(get(outbox.view)).toEqual({
        ownerId: null,
        records: [],
        busy: false,
      });
    } finally {
      release.resolve();
      await clearing;
      releaseIdentity();
    }
  });
}

test("runtime dispose without an active logout clear closes resources immediately", () => {
  const state = { closed: false, changesClosed: false };
  const outbox = createOutbox({
    queue: {
      ...memoryQueue(),
      close: () => {
        state.closed = true;
      },
    },
    auth: {
      current: () => null,
      online: () => false,
      reconcile: async () => {},
      subscribe: () => () => {},
      registerLogout: () => () => {},
    },
    sender: async () => ({ kind: "unknown" }),
    locks: { run: async (_owner, run) => run() },
    changes: {
      publish: () => {},
      subscribe: () => () => {},
      close: () => {
        state.changesClosed = true;
      },
    },
  });
  outbox.dispose();
  expect(state).toEqual({ closed: true, changesClosed: true });
});

test("synchronous logout callback failure still acquires every owner and retains its cause", async () => {
  const lifecycle = createLogoutLifecycle();
  const cause = new Error("Owned callback threw before returning a promise");
  const calls: string[] = [];
  lifecycle.register(() => {
    calls.push("first");
    throw cause;
  });
  lifecycle.register(async () => {
    calls.push("second");
  });
  const pending = lifecycle.flush(null);
  expect(calls).toEqual(["first", "second"]);
  const failure = await pending?.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError))
    throw new Error("Missing original cleanup failure");
  expect(failure.errors).toEqual([cause]);
});
