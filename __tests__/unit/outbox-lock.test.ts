import { expect, test } from "bun:test";
import { get } from "svelte/store";
import {
  memoryQueue,
  readRecords,
} from "../../apps/fe-insta/__tests__/fixtures/outbox/memory";
import { drain } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/drain";
import { createAuthBrowser } from "../../apps/fe-insta/src/domains/users/browser/store";

const record = {
  ownerId: "owner",
  conversationId: "a".repeat(24),
  text: "synthetic",
  key: "stable",
  clientMessageId: "client",
  operationId: "op",
  createdAt: 0,
  attempts: 0,
  nextAttemptAt: 0,
  lastAuthGeneration: "g1",
  revision: 0,
  manualAttempt: false,
  state: "queued",
  needsConfirmation: false,
} as const;
test("held postresponse auth read releases short lock and late different generation cannot remove retained operation", async () => {
  const queue = memoryQueue();
  await queue.insert(record);
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const state = {
    reads: 0,
    locked: false,
    actor: { ownerId: "owner", generation: "g1" },
  };
  const pending = drain(
    { ownerId: "owner", authGeneration: "g1", now: 0 },
    {
      queue,
      jitter: () => 0,
      sender: async () => ({ kind: "confirmed", messageId: "persisted" }),
      auth: {
        current: () => state.actor,
        online: () => true,
        reconcile: async () => {
          state.reads++;
          if (state.reads === 2) {
            held.resolve();
            await release.promise;
          }
        },
      },
      locks: {
        run: async <T>(_owner: string, execute: () => Promise<T>) => {
          state.locked = true;
          try {
            return await execute();
          } finally {
            state.locked = false;
          }
        },
      },
    },
  );
  try {
    await held.promise;
    expect(state.locked).toBe(false);
    state.actor = { ownerId: "other", generation: "g2" };
    release.resolve();
    expect((await pending).confirmed).toBe(0);
    expect((await readRecords(queue))[0]).toMatchObject({
      key: "stable",
      attempts: 1,
    });
  } finally {
    release.resolve();
    await pending;
  }
});
test("aborted auth read never accepts a late foreign actor", async () => {
  const actor = { userId: "owner", username: "Owner", generation: "g1" };
  const response = Promise.withResolvers<typeof actor>();
  const abort = new AbortController();
  const auth = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read: () => response.promise,
    clearPrivate: () => {},
    synchronization: {
      exclusive: async <T>(run: () => Promise<T>) => run(),
      subscribe: () => () => {},
      publish: () => {},
    },
  });
  const pending = auth.reconcile({ signal: abort.signal });
  abort.abort();
  response.resolve({ userId: "other", username: "Other", generation: "g2" });
  await pending;
  expect(get(auth.view).actor).toEqual(actor);
});
test("hung cookie revalidation is bounded, aborts provider and retains unknown operation", async () => {
  const queue = memoryQueue();
  await queue.insert(record);
  const state = { reads: 0, signal: undefined as AbortSignal | undefined };
  const result = await drain(
    { ownerId: "owner", authGeneration: "g1", now: 0 },
    {
      queue,
      jitter: () => 0,
      sender: async () => ({ kind: "confirmed", messageId: "persisted" }),
      auth: {
        current: () => ({ ownerId: "owner", generation: "g1" }),
        online: () => true,
        reconcile: async (options) => {
          state.reads++;
          if (state.reads === 2) {
            state.signal = options?.signal;
            await new Promise<void>(() => {});
          }
        },
      },
      locks: {
        run: async <T>(_owner: string, execute: () => Promise<T>) => execute(),
      },
    },
  );
  expect(result).toMatchObject({
    sent: 1,
    confirmed: 0,
    issue: "AUTH_UNAVAILABLE",
  });
  expect(state.signal?.aborted).toBe(true);
  expect((await readRecords(queue))[0]).toMatchObject({
    key: "stable",
    attempts: 1,
  });
}, 15000);
