import { expect, test } from "bun:test";
import { get } from "svelte/store";
import type {
  History,
  Message,
} from "../../src/domains/conversations/browser/state/index";
import {
  createConversationStore,
  mergeMessages,
} from "../../src/domains/conversations/browser/state/index";

const actor = { userId: "sender", generation: "login1" };
const conversationId = "c".repeat(24);
const deliveredAt = "2026-10-11T10:00:00.000Z";
const readAt = "2026-10-11T10:00:01.000Z";
const message = (receipt?: Message["receipt"]): Message => ({
  id: "m1",
  conversationId,
  authorId: "sender",
  text: "hello",
  sequence: 1,
  createdAt: deliveredAt,
  ...(receipt ? { receipt } : {}),
});
const history = (items: readonly Message[]): History => ({
  items,
  baselineCursor: 0,
  watermark: 1,
  pageInfo: { hasMore: false, nextCursor: null },
});
const read = { deliveredAt, readAt };
const batch = {
  conversationId,
  receipts: [
    { messageId: "m1", recipientId: "recipient", sequence: 1, ...read },
  ],
};
const fixture = () => createConversationStore({ actor, initial: [] });

test("read survives stale delivered, history without receipt and message replay", () => {
  const store = fixture();
  store.hydrate({ actor, conversationId, history: history([message(read)]) });
  store.hydrate({
    actor,
    conversationId,
    history: history([message({ deliveredAt, readAt: null })]),
  });
  store.receive(message(), actor);
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
});

test("receipt event before message and history remains available without loaded bubbles", () => {
  const store = fixture();
  store.receiveReceipts(batch, actor);
  store.hydrate({ actor, conversationId, history: history([message()]) });
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
});

for (const next of [
  { ...actor, generation: "login2" },
  { userId: "other", generation: "login2" },
]) {
  test(`late receipt result cannot enter ${next.userId}/${next.generation}`, () => {
    const store = fixture();
    store.receiveReceipts(batch, actor);
    store.reconcileActor(next);
    store.receiveReceipts(batch, actor);
    store.hydrate({
      actor: next,
      conversationId,
      history: history([message()]),
    });
    expect(
      get(store.view).histories.get(conversationId)?.items[0]?.receipt,
    ).toBeUndefined();
  });
}

test("fresh instance restores persisted read through canonical history", () => {
  const store = fixture();
  store.hydrate({ actor, conversationId, history: history([message(read)]) });
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
});

test("lost last WS receipt is recovered from persisted loaded range after resubscribe", async () => {
  const store = fixture();
  store.hydrate({ actor, conversationId, history: history([message()]) });
  const order: string[] = [];
  await store.synchronize(
    { actor, conversationId },
    {
      subscribe: async () => {
        order.push("subscribed");
        return () => {};
      },
      history: async ({ after }) => {
        order.push("history");
        return history(after === 0 ? [message(read)] : []);
      },
      merge: mergeMessages,
    },
  );
  expect(order).toEqual(["subscribed", "history"]);
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
  store.clear();
});

test("receipt replay never downgrades a read event and independent stores share no snapshots", () => {
  const store = fixture();
  const independent = fixture();
  store.receiveReceipts(batch, actor);
  store.receiveReceipts(
    {
      ...batch,
      receipts: batch.receipts.map((receipt) => ({ ...receipt, readAt: null })),
    },
    actor,
  );
  for (const target of [store, independent])
    target.hydrate({ actor, conversationId, history: history([message()]) });
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
  expect(
    get(independent.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toBeUndefined();
});

test("reconnect rereads retained messages across page cursors without skipping older receipts", async () => {
  const store = fixture();
  const messages = Array.from({ length: 150 }, (_, index) => ({
    ...message(),
    id: `m${index + 1}`,
    sequence: index + 1,
  }));
  store.hydrate({
    actor,
    conversationId,
    history: { ...history(messages), watermark: 150 },
  });
  const queries: unknown[] = [];
  await store.synchronize(
    { actor, conversationId },
    {
      subscribe: async () => () => {},
      history: async (query) => {
        queries.push(query);
        if (query.after === 0)
          return {
            ...history(messages.slice(0, 100)),
            watermark: 150,
            pageInfo: { hasMore: true, nextCursor: "held-page-101" },
          };
        expect(query.cursor).toBe("held-page-101");
        return {
          ...history(
            messages
              .slice(100)
              .map((value) =>
                value.id === "m125" ? { ...value, receipt: read } : value,
              ),
          ),
          baselineCursor: 100,
          watermark: 150,
        };
      },
      merge: mergeMessages,
    },
  );
  expect(queries).toEqual([
    { conversationId, after: 0 },
    { conversationId, cursor: "held-page-101" },
  ]);
  expect(get(store.view).histories.get(conversationId)?.verifiedCursor).toBe(
    150,
  );
  expect(
    get(store.view)
      .histories.get(conversationId)
      ?.items.find(({ id }) => id === "m125")?.receipt,
  ).toEqual(read);
  store.clear();
});

test("receipt received during held history read beats stale history when sync settles", async () => {
  const store = fixture();
  const reached = Promise.withResolvers<void>();
  const held = Promise.withResolvers<History>();
  const pending = store.synchronize(
    { actor, conversationId },
    {
      subscribe: async () => () => {},
      history: async () => {
        reached.resolve();
        return held.promise;
      },
      merge: mergeMessages,
    },
  );
  await reached.promise;
  store.receiveReceipts(batch, actor);
  held.resolve(history([message({ deliveredAt, readAt: null })]));
  await pending;
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
  store.clear();
});

test("buffered message replay cannot erase read from first canonical history snapshot", async () => {
  const store = fixture();
  await store.synchronize(
    { actor, conversationId },
    {
      subscribe: async (_id, receive) => {
        receive(message());
        return () => {};
      },
      history: async () => history([message(read)]),
      merge: mergeMessages,
    },
  );
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
  store.clear();
});

test("duplicate receipt IDs in one snapshot cannot downgrade read", () => {
  const store = fixture();
  store.receiveReceipts(
    {
      conversationId,
      receipts: [
        batch.receipts[0],
        {
          messageId: "m1",
          recipientId: "recipient",
          sequence: 1,
          deliveredAt,
          readAt: null,
        },
      ],
    },
    actor,
  );
  store.hydrate({ actor, conversationId, history: history([message()]) });
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
});

test("pure snapshot merge preserves timestamps and caller input; conflicting identity fails", async () => {
  const { mergeReceiptSnapshots } = await import(
    "../../src/domains/conversations/browser/state/index"
  );
  const current = [
    {
      messageId: "m1",
      recipientId: "recipient",
      sequence: 1,
      deliveredAt,
      readAt,
    },
  ];
  const incoming = [
    {
      messageId: "m1",
      recipientId: "recipient",
      sequence: 1,
      deliveredAt: null,
      readAt: null,
    },
  ];
  expect(mergeReceiptSnapshots({ current, incoming })).toEqual(current);
  expect(incoming[0]?.readAt).toBeNull();
  expect(() =>
    mergeReceiptSnapshots({
      current,
      incoming: [{ ...current[0], recipientId: "other" }],
    }),
  ).toThrow("Conflicting receipt identity");
});

test("view receipt objects cannot mutate the private authoritative snapshot", () => {
  const store = fixture();
  store.receiveReceipts(batch, actor);
  store.hydrate({ actor, conversationId, history: history([message()]) });
  const receipt = get(store.view).histories.get(conversationId)?.items[0]
    ?.receipt;
  if (!receipt) throw new Error("Missing receipt");
  receipt.readAt = null;
  store.hydrate({ actor, conversationId, history: history([message()]) });
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toEqual(read);
});
