import { describe, expect, test } from "bun:test";
import { mergeMessages } from "../../../apps/fe-insta/src/domains/conversations/browser/merge";
import { synchronize } from "../../../apps/fe-insta/src/domains/conversations/browser/synchronize";

const message = (sequence: number) => ({
  id: `m${sequence}`,
  conversationId: "c",
  authorId: "a",
  text: `text${sequence}`,
  sequence,
  createdAt: "2026-10-09T00:00:00.000Z",
});
const page = (
  sequences: readonly number[],
  baselineCursor = 0,
  watermark = Math.max(baselineCursor, ...sequences),
) => ({
  items: sequences.map(message),
  baselineCursor,
  watermark,
  pageInfo: { hasMore: false, nextCursor: null },
});
describe("CHAT-05 history continuity", () => {
  test("orders out-of-order events and merges REST confirmation with WS by canonical message ID", () => {
    const merged = mergeMessages({
      current: [message(3), message(1)],
      incoming: [message(2), message(3)],
    });
    expect(merged.map(({ id }) => id)).toEqual(["m1", "m2", "m3"]);
  });
  test("subscription ACK precedes snapshot; buffers events and never advances over a gap", async () => {
    const order: string[] = [];
    const ack = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    let receive: (value: ReturnType<typeof message>) => void = () => {};
    const pending = synchronize(
      { conversationId: "c", verifiedCursor: 0 },
      {
        subscribe: async (_id, onMessage) => {
          order.push("subscribe");
          receive = onMessage;
          started.resolve();
          await ack.promise;
          order.push("ack");
          return () => {};
        },
        history: async () => {
          order.push("history");
          receive(message(4));
          return page([1, 2], 0, 4);
        },
        merge: mergeMessages,
      },
    );
    await started.promise;
    expect(order).toEqual(["subscribe"]);
    ack.resolve();
    const result = await pending;
    expect(order).toEqual(["subscribe", "ack", "history"]);
    expect(result.items.map(({ id }) => id)).toEqual(["m1", "m2", "m4"]);
    expect(result.verifiedCursor).toBe(2);
    result.release();
  });
  test("late commit closes persisted gap and duplicate live event stays singular", async () => {
    const result = await synchronize(
      { conversationId: "c", verifiedCursor: 2 },
      {
        subscribe: async (_id, receive) => {
          receive(message(4));
          return () => {};
        },
        history: async ({ after }) => {
          expect(after).toBe(2);
          return page([3, 4], 2, 4);
        },
        merge: mergeMessages,
      },
    );
    expect(result.items.map(({ id }) => id)).toEqual(["m3", "m4"]);
    expect(result.verifiedCursor).toBe(4);
  });
  test("recent snapshot starts continuity at server baseline and paginated catchup retains cursor proof", async () => {
    const queries: unknown[] = [];
    const result = await synchronize(
      { conversationId: "c", verifiedCursor: null },
      {
        subscribe: async () => () => {},
        history: async (query) => {
          queries.push(query);
          return page([51, 52], 50, 52);
        },
        merge: mergeMessages,
      },
    );
    expect(result.verifiedCursor).toBe(52);
    expect(queries).toEqual([{ conversationId: "c" }]);
  });
});

test("history cache eviction releases the old subscription and its private receipt snapshot", async () => {
  const { get } = await import("svelte/store");
  const { createConversationStore } = await import(
    "../../../apps/fe-insta/src/domains/conversations/browser/store"
  );
  const actor = { userId: "a", generation: "login1" };
  const store = createConversationStore({ actor, initial: [] });
  const released: string[] = [];
  for (let index = 0; index < 6; index++) {
    const conversationId = `c${index}`;
    await store.synchronize(
      { actor, conversationId },
      {
        subscribe: async (id) => () => {
          released.push(id);
        },
        history: async () => ({
          ...page([1]),
          items: [
            {
              ...message(1),
              conversationId,
              receipt: {
                deliveredAt: "2026-10-09T00:00:01.000Z",
                readAt: "2026-10-09T00:00:02.000Z",
              },
            },
          ],
        }),
        merge: mergeMessages,
      },
    );
  }
  expect(released).toEqual(["c0"]);
  expect(get(store.view).histories.size).toBe(5);
  store.hydrate({
    actor,
    conversationId: "c0",
    history: { ...page([1]), items: [{ ...message(1), conversationId: "c0" }] },
  });
  expect(released).toEqual(["c0", "c1"]);
  expect(
    get(store.view).histories.get("c0")?.items[0]?.receipt,
  ).toBeUndefined();
  store.clear();
  expect(released).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
});
