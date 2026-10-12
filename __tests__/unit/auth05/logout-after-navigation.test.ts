import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import {
  memoryQueue,
  readRecords,
} from "../../../apps/fe-insta/__tests__/fixtures/outbox/memory";
import { createOutboxAuth } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/auth";
import { createOutbox } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/store";
import { enqueue } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/enqueue";
import { registerOutboxLogout } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/register-logout";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";

const createAuth = () => {
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
  const outboxAuth = createOutboxAuth(auth, {
    online: () => false,
    offlineEvents: new EventTarget(),
  });
  return { auth, outboxAuth };
};

test("explicit logout after leaving conversations removes retained drafts", async () => {
  const { auth, outboxAuth } = createAuth();
  const queue = memoryQueue();
  const releaseLogout = registerOutboxLogout({
    auth: outboxAuth,
    createQueue: () => queue,
    changed: () => {},
  });
  const outbox = createOutbox({
    queue,
    auth: outboxAuth,
    sender: async () => ({ kind: "unknown" }),
    locks: { run: async (_owner, run) => run() },
    changes: {
      publish: () => {},
      subscribe: () => () => {},
      close: () => {},
    },
  });
  try {
    expect(
      (
        await outbox.enqueue({
          conversationId: "a".repeat(24),
          text: "Private draft retained only until explicit logout",
        })
      ).isOk(),
    ).toBe(true);
    outbox.dispose();
    expect(await readRecords(queue)).toHaveLength(1);
    auth.accept({ userId: "owner", username: "owner", generation: "g2" });
    expect(await readRecords(queue)).toHaveLength(1);
    await auth.beginLogout();
    expect(await readRecords(queue)).toEqual([]);
  } finally {
    outbox.dispose();
    releaseLogout();
  }
});

test("logout without a conversations runtime lazily clears only its owner and closes the acquired handle", async () => {
  const { auth, outboxAuth } = createAuth();
  const queue = memoryQueue();
  for (const ownerId of ["owner", "other"]) {
    const saved = await enqueue(
      {
        ownerId,
        authGeneration: "g1",
        conversationId: "a".repeat(24),
        text: "Previously persisted draft",
      },
      { queue, clock: () => 1000, uuid: () => crypto.randomUUID() },
    );
    expect(saved.isOk()).toBe(true);
  }
  const lifecycle: string[] = [];
  const release = registerOutboxLogout({
    auth: outboxAuth,
    createQueue: () => {
      lifecycle.push("acquire");
      return {
        clear: queue.clear,
        close: () => lifecycle.push("close"),
      };
    },
    changed: () => lifecycle.push("changed"),
  });
  try {
    expect(lifecycle).toEqual([]);
    await auth.beginLogout();
    expect(await readRecords(queue)).toEqual([]);
    expect(await readRecords(queue, "other")).toHaveLength(1);
    expect(lifecycle).toEqual(["acquire", "changed", "close"]);
    await auth.beginLogout();
    expect(lifecycle).toEqual(["acquire", "changed", "close"]);
  } finally {
    release();
  }
});

for (const outcome of ["success", "failure", "rejection"] as const) {
  test(`unmount during logout ${outcome} retains the handle until clear settles`, async () => {
    const { auth, outboxAuth } = createAuth();
    const barrier = Promise.withResolvers<void>();
    const lifecycle: string[] = [];
    const release = registerOutboxLogout({
      auth: outboxAuth,
      createQueue: () => ({
        clear: async () => {
          lifecycle.push("clear");
          await barrier.promise;
          if (outcome === "rejection") throw new Error("Provider rejected");
          return outcome === "failure"
            ? Result.Error("PERSISTENCE_FAILED")
            : Result.Ok(undefined);
        },
        close: () => lifecycle.push("close"),
      }),
      changed: () => lifecycle.push("changed"),
    });
    const clearing = Promise.resolve(auth.beginLogout()).then(
      () => "cleared",
      () => "failed",
    );
    try {
      release();
      expect(lifecycle).toEqual(["clear"]);
      barrier.resolve();
      expect(await clearing).toBe(outcome === "success" ? "cleared" : "failed");
      expect(lifecycle).toEqual(
        outcome === "success"
          ? ["clear", "changed", "close"]
          : ["clear", "close"],
      );
    } finally {
      barrier.resolve();
      await clearing;
      release();
    }
  });
}
