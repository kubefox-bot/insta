import { expect, test } from "bun:test";
import { get } from "svelte/store";
import {
  memoryQueue,
  readRecords,
} from "../../../apps/fe-insta/__tests__/fixtures/outbox/memory";
import {
  createOutbox,
  createOutboxAuth,
} from "../../../apps/fe-insta/src/domains/conversations/browser/index";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";

const actor = { userId: "owner", username: "Owner", generation: "g1" };
const harness = (
  read: (signal?: AbortSignal) => Promise<typeof actor | null>,
) => {
  const state = { online: false, sends: 0 };
  const events = new EventTarget();
  const queue = memoryQueue();
  const browser = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read,
    clearPrivate: () => {},
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const adapter = createOutboxAuth(browser, {
    online: () => state.online,
    offlineEvents: events,
  });
  const outbox = createOutbox({
    queue,
    auth: { ...adapter, online: () => state.online },
    sender: async () => {
      state.sends++;
      return { kind: "confirmed", messageId: "persisted" };
    },
    locks: { run: async (_owner, execute) => execute() },
    changes: { publish: () => {}, subscribe: () => () => {}, close: () => {} },
    clock: () => 0,
    uuid: () => crypto.randomUUID(),
    jitter: () => 0,
  });
  return { state, events, queue, browser, outbox };
};
test("real AuthBrowser and outbox retain confirmed local actor/pending queue offline without auth/send calls or attempts", async () => {
  let reads = 0;
  const h = harness(async () => {
    reads++;
    throw new Error("Offline network");
  });
  try {
    expect(
      (
        await h.outbox.enqueue({
          conversationId: "a".repeat(24),
          text: "offline pending",
        })
      ).isOk(),
    ).toBe(true);
    await h.outbox.wake();
    expect(reads).toBe(0);
    expect(h.state.sends).toBe(0);
    expect(get(h.browser.view).actor).toEqual(actor);
    expect(get(h.outbox.view).records).toHaveLength(1);
    expect((await readRecords(h.queue))[0]?.attempts).toBe(0);
  } finally {
    h.outbox.dispose();
  }
});
test("offline during owned auth read aborts only that read and preserves actor before online reconciliation", async () => {
  const started = Promise.withResolvers<void>();
  let reads = 0;
  const h = harness(async (signal) => {
    reads++;
    if (reads !== 1) return actor;
    started.resolve();
    return new Promise<typeof actor>((_resolve, reject) => {
      signal?.addEventListener(
        "abort",
        () => reject(new Error("Owned read aborted")),
        { once: true },
      );
    });
  });
  h.state.online = true;
  try {
    await h.outbox.enqueue({
      conversationId: "a".repeat(24),
      text: "held read pending",
    });
    await started.promise;
    h.state.online = false;
    h.events.dispatchEvent(new Event("offline"));
    await h.outbox.wake();
    expect(get(h.browser.view).actor).toEqual(actor);
    expect(h.state.sends).toBe(0);
    expect((await readRecords(h.queue))[0]?.attempts).toBe(0);
    h.state.online = true;
    await h.outbox.wake();
    expect(reads).toBeGreaterThan(1);
    expect(h.state.sends).toBe(1);
    expect(get(h.outbox.view).records).toHaveLength(0);
  } finally {
    h.outbox.dispose();
  }
});
test.each([
  { name: "new login", fresh: { ...actor, generation: "g2" }, owner: "owner" },
  { name: "revoked", fresh: null, owner: null },
  {
    name: "foreign account",
    fresh: { ...actor, userId: "other", generation: "g2" },
    owner: "other",
  },
])(
  "online after offline must reconcile $name before sending retained queue",
  async ({ name, fresh, owner }) => {
    let reads = 0;
    const h = harness(async () => {
      reads++;
      return fresh;
    });
    const projected = Promise.withResolvers<void>();
    const unsubscribe = h.outbox.view.subscribe((view) => {
      if (name === "new login" && view.records[0]?.state === "confirmation")
        projected.resolve();
    });
    try {
      await h.outbox.enqueue({
        conversationId: "a".repeat(24),
        text: "retained owner operation",
      });
      await h.outbox.wake();
      const original = (await readRecords(h.queue))[0];
      expect(reads).toBe(0);
      h.state.online = true;
      await h.outbox.wake();
      if (name === "new login") await projected.promise;
      expect(reads).toBeGreaterThan(0);
      expect(h.state.sends).toBe(0);
      expect(get(h.outbox.view).ownerId).toBe(owner);
      expect((await readRecords(h.queue))[0]?.key).toBe(original?.key);
      if (name !== "new login") expect(get(h.outbox.view).records).toEqual([]);
    } finally {
      unsubscribe();
      h.outbox.dispose();
    }
  },
);
