import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createConversationStore } from "../../../apps/fe-insta/src/domains/conversations/browser/store";

const actor = { userId: "owner", generation: "login1" };
const message = (sequence: number, conversationId = "c") => ({
  id: `${conversationId}${sequence}`,
  conversationId,
  authorId: "owner",
  text: "text",
  sequence,
  createdAt: "2026-10-09T00:00:00.000Z",
});
const history = (items = [message(1)]) => ({
  items,
  baselineCursor: 0,
  watermark: items.length,
  pageInfo: { hasMore: false, nextCursor: null },
});
test("SSR history is adopted without duplicate load; instances and late generation results stay isolated", async () => {
  const store = createConversationStore({ initial: [], actor });
  const independent = createConversationStore({ initial: [], actor });
  store.hydrate({ actor, conversationId: "c", history: history() });
  expect(get(store.view).histories.get("c")?.items).toHaveLength(1);
  expect(get(independent.view).histories.size).toBe(0);
  const reached = Promise.withResolvers<void>();
  const barrier = Promise.withResolvers<void>();
  const pending = store.synchronize(
    { actor, conversationId: "c" },
    {
      subscribe: async () => () => {},
      history: async ({ after }) => {
        expect(after).toBe(0);
        reached.resolve();
        await barrier.promise;
        return history([message(2)]);
      },
      merge: ({ current, incoming }) => [...current, ...incoming],
    },
  );
  await reached.promise;
  store.reconcileActor({ ...actor, generation: "login2" });
  barrier.resolve();
  await pending;
  expect(get(store.view).histories.size).toBe(0);
  store.hydrate({ actor, conversationId: "c", history: history() });
  expect(get(store.view).histories.size).toBe(0);
});
test("cache has five dialogues and 200 messages without owning or evicting durable queue", () => {
  const store = createConversationStore({ initial: [], actor });
  for (let i = 0; i < 6; i++)
    store.hydrate({
      actor,
      conversationId: `c${i}`,
      history: history(
        Array.from({ length: 220 }, (_, index) => message(index + 1, `c${i}`)),
      ),
    });
  expect(get(store.view).histories.size).toBe(5);
  expect(get(store.view).histories.has("c0")).toBe(false);
  expect(get(store.view).histories.get("c5")?.items).toHaveLength(200);
  expect(get(store.view).histories.get("c5")?.verifiedCursor).toBe(220);
});
test("older pagination preserves live verified cursor and stale actor clears private data", async () => {
  const store = createConversationStore({ initial: [], actor });
  store.hydrate({
    actor,
    conversationId: "c",
    history: {
      ...history([message(51), message(52)]),
      baselineCursor: 50,
      watermark: 52,
      pageInfo: { hasMore: true, nextCursor: "older" },
    },
  });
  await store.earlier({ actor, conversationId: "c" }, async ({ cursor }) => {
    expect(cursor).toBe("older");
    return history([message(49), message(50)]);
  });
  expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(52);
  store.reconcileActor(null);
  store.receive(message(53), actor);
  expect(get(store.view).histories.size).toBe(0);
  expect(get(store.view).conversations).toEqual([]);
});
test("evicting early live rows still permits fetching the older window with a bounded persisted query", async () => {
  const store = createConversationStore({ initial: [], actor });
  store.hydrate({
    actor,
    conversationId: "c",
    history: history(
      Array.from({ length: 250 }, (_, index) => message(index + 1)),
    ),
  });
  let queried = false;
  await store.earlier(
    { actor, conversationId: "c" },
    async ({ after, limit }) => {
      queried = true;
      expect(after).toBe(0);
      expect(limit).toBe(100);
      return history(
        Array.from({ length: 100 }, (_, index) => message(index + 1)),
      );
    },
  );
  expect(queried).toBe(true);
  expect(get(store.view).histories.get("c")?.items[0]?.sequence).toBe(1);
  expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(250);
});
test("one observed live gap triggers ACK then persisted catch-up without advancing to maximum event sequence", async () => {
  const store = createConversationStore({ initial: [], actor });
  store.hydrate({
    actor,
    conversationId: "c",
    history: history([message(1), message(2)]),
  });
  let receive: (value: ReturnType<typeof message>) => void = () => {};
  let reads = 0;
  let subscriptions = 0;
  const order: string[] = [];
  const recovered = Promise.withResolvers<void>();
  const stop = store.view.subscribe((view) => {
    if (view.histories.get("c")?.verifiedCursor === 4) recovered.resolve();
  });
  const dependencies = {
    subscribe: async (_id: string, onMessage: typeof receive) => {
      subscriptions++;
      order.push(`ack${subscriptions}`);
      receive = onMessage;
      return () => {};
    },
    history: async ({ after }: { after?: number }) => {
      reads++;
      order.push(`history${reads}`);
      expect(after).toBe(0);
      return reads === 1
        ? { ...history([]), baselineCursor: 2, watermark: 2 }
        : {
            ...history([message(3), message(4)]),
            baselineCursor: 2,
            watermark: 4,
          };
    },
    merge: ({
      current,
      incoming,
    }: {
      current: readonly ReturnType<typeof message>[];
      incoming: readonly ReturnType<typeof message>[];
    }) => [...current, ...incoming],
  };
  try {
    await store.synchronize({ actor, conversationId: "c" }, dependencies);
    receive(message(4));
    expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(2);
    await recovered.promise;
    expect(order).toEqual(["ack1", "history1", "ack2", "history2"]);
    expect(
      get(store.view)
        .histories.get("c")
        ?.items.map(({ sequence }) => sequence),
    ).toEqual([1, 2, 3, 4]);
  } finally {
    stop();
    store.clear();
  }
});
