import { expect, test } from "bun:test";
import { get } from "svelte/store";
import {
  createConversationStore,
  createOutboxSender,
} from "../../../apps/fe-insta/src/domains/conversations/browser/index";

const actor = { userId: "alice", generation: "login1" };
const record = {
  ownerId: "alice",
  conversationId: "c",
  text: "canonical",
  key: "key",
  clientMessageId: "client",
  operationId: crypto.randomUUID(),
  createdAt: 0,
  attempts: 1,
  nextAttemptAt: 0,
  lastAuthGeneration: "login1",
  revision: 1,
  manualAttempt: false,
  state: "queued",
  needsConfirmation: false,
} as const;
const message = {
  id: "server",
  conversationId: "c",
  authorId: "alice",
  clientMessageId: "client",
  text: "canonical",
  sequence: 1,
  createdAt: "2026-10-09T00:00:00.000Z",
};
const create = () => {
  const store = createConversationStore({ initial: [], actor });
  store.hydrate({
    actor,
    conversationId: "c",
    history: {
      items: [],
      baselineCursor: 0,
      watermark: 0,
      pageInfo: { hasMore: false, nextCursor: null },
    },
  });
  return store;
};
test("validated REST canonical body and WS delivery share one persisted message", async () => {
  const store = create();
  const sender = createOutboxSender({
    request: async () => Response.json({ ok: true, data: message }),
    onConfirmed: (canonical, owner) =>
      store.receive(canonical, {
        userId: owner.ownerId,
        generation: owner.generation,
      }),
  });
  expect((await sender(record)).kind).toBe("confirmed");
  store.receive(message, actor);
  expect(get(store.view).histories.get("c")?.items).toEqual([message]);
  expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(1);
});
test("late canonical callback from old login does not populate a new login's private memory", async () => {
  const store = create();
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const sender = createOutboxSender({
    request: async () => {
      reached.resolve();
      await release.promise;
      return Response.json({ ok: true, data: message });
    },
    onConfirmed: (canonical, owner) =>
      store.receive(canonical, {
        userId: owner.ownerId,
        generation: owner.generation,
      }),
  });
  const pending = sender(record);
  await reached.promise;
  store.reconcileActor({ ...actor, generation: "login2" });
  release.resolve();
  expect((await pending).kind).toBe("confirmed");
  expect(get(store.view).histories.size).toBe(0);
});
test("consumer failure is diagnosed separately and cannot convert persisted confirmation to unknown retry", async () => {
  const diagnosed: unknown[] = [];
  const sender = createOutboxSender({
    request: async () => Response.json({ ok: true, data: message }),
    onConfirmed: () => {
      throw new Error("Projection failed");
    },
    onConsumerError: (error) => diagnosed.push(error),
  });
  expect((await sender(record)).kind).toBe("confirmed");
  expect(diagnosed).toHaveLength(1);
});
test("disposed sender signal prevents a late successful HTTP body from publishing a private callback", async () => {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  const controller = new AbortController();
  const published: unknown[] = [];
  const sender = createOutboxSender({
    request: async () => {
      reached.resolve();
      await release.promise;
      finished.resolve();
      return Response.json({ ok: true, data: message });
    },
    onConfirmed: (canonical) => published.push(canonical),
  });
  const pending = sender(record, { signal: controller.signal });
  await reached.promise;
  controller.abort();
  expect((await pending).kind).toBe("unknown");
  release.resolve();
  await finished.promise;
  await Promise.resolve();
  expect(published).toEqual([]);
});
