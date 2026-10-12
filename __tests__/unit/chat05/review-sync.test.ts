import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { mergeMessages } from "../../../apps/fe-insta/src/domains/conversations/browser/merge";
import { createConversationStore } from "../../../apps/fe-insta/src/domains/conversations/browser/store";
import type {
  History,
  HistoryQuery,
  Message,
} from "../../../apps/fe-insta/src/domains/conversations/browser/types";

const actor = { userId: "owner", generation: "login1" };
const message = (sequence: number): Message => ({
  id: `m${sequence}`,
  conversationId: "c",
  authorId: "peer",
  text: `text${sequence}`,
  sequence,
  createdAt: "2026-10-09T00:00:00.000Z",
});
const page = (
  sequences: readonly number[],
  baselineCursor = 0,
  cursor: string | null = null,
): History => ({
  items: sequences.map(message),
  baselineCursor,
  watermark: Math.max(baselineCursor, ...sequences),
  pageInfo: { hasMore: cursor !== null, nextCursor: cursor },
});
test("review I1 earlier pagination retains live subscription through WS53", async () => {
  const store = createConversationStore({ initial: [], actor });
  store.hydrate({
    actor,
    conversationId: "c",
    history: page([51, 52], 50, "older"),
  });
  const live: { receive: (m: Message) => void } = { receive: () => {} };
  await store.synchronize(
    { actor, conversationId: "c" },
    {
      subscribe: async (_id, receive) => {
        live.receive = receive;
        return () => {};
      },
      history: async () => page([], 52),
      merge: mergeMessages,
    },
  );
  await store.earlier({ actor, conversationId: "c" }, async () =>
    page([49, 50], 48),
  );
  live.receive(message(53));
  expect(
    get(store.view)
      .histories.get("c")
      ?.items.map((m) => m.sequence),
  ).toEqual([49, 50, 51, 52, 53]);
  expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(53);
  store.clear();
});
test("review I2 buffered WS4 gap performs coalesced persisted followup for lost WS3", async () => {
  const store = createConversationStore({ initial: [], actor });
  const held = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
  const live: { receive: (m: Message) => void } = { receive: () => {} };
  const queries: HistoryQuery[] = [];
  const pending = store.synchronize(
    { actor, conversationId: "c" },
    {
      subscribe: async (_id, receive) => {
        live.receive = receive;
        return () => {};
      },
      history: async (query) => {
        queries.push(query);
        if (queries.length === 1) {
          reached.resolve();
          await held.promise;
          return page([1, 2]);
        }
        return page([3, 4], 2);
      },
      merge: mergeMessages,
    },
  );
  await reached.promise;
  live.receive(message(4));
  live.receive(message(4));
  held.resolve();
  await pending;
  expect(
    get(store.view)
      .histories.get("c")
      ?.items.map((m) => m.sequence),
  ).toEqual([1, 2, 3, 4]);
  expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(4);
  expect(queries).toEqual([
    { conversationId: "c" },
    { conversationId: "c", after: 2 },
  ]);
  store.clear();
});
for (const invalidate of ["generation", "dispose"] as const) {
  test(`retained subscription and late pagination reject ${invalidate} invalidation`, async () => {
    const store = createConversationStore({ initial: [], actor });
    store.hydrate({
      actor,
      conversationId: "c",
      history: page([51, 52], 50, "older"),
    });
    const live: { receive: (m: Message) => void } = { receive: () => {} };
    let releases = 0;
    await store.synchronize(
      { actor, conversationId: "c" },
      {
        subscribe: async (_id, receive) => {
          live.receive = receive;
          return () => {
            releases++;
          };
        },
        history: async () => page([], 52),
        merge: mergeMessages,
      },
    );
    const held = Promise.withResolvers<History>();
    const reached = Promise.withResolvers<void>();
    const pending = store.earlier({ actor, conversationId: "c" }, async () => {
      reached.resolve();
      return held.promise;
    });
    await reached.promise;
    if (invalidate === "generation")
      store.reconcileActor({ ...actor, generation: "login2" });
    else store.clear();
    live.receive(message(53));
    held.resolve(page([49, 50], 48));
    await pending;
    expect(get(store.view).histories.size).toBe(0);
    expect(releases).toBe(1);
  });
  test(`buffered followup rejects ${invalidate} invalidation and releases late subscription`, async () => {
    const store = createConversationStore({ initial: [], actor });
    const held = Promise.withResolvers<void>();
    const reached = Promise.withResolvers<void>();
    const live: { receive: (m: Message) => void } = { receive: () => {} };
    let reads = 0;
    let releases = 0;
    const pending = store.synchronize(
      { actor, conversationId: "c" },
      {
        subscribe: async (_id, receive) => {
          live.receive = receive;
          return () => {
            releases++;
          };
        },
        history: async () => {
          reads++;
          if (reads === 1) {
            live.receive(message(4));
            return page([1, 2]);
          }
          reached.resolve();
          await held.promise;
          return page([3, 4], 2);
        },
        merge: mergeMessages,
      },
    );
    await reached.promise;
    expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(2);
    if (invalidate === "generation")
      store.reconcileActor({ ...actor, generation: "login2" });
    else store.clear();
    live.receive(message(5));
    held.resolve();
    await pending;
    expect(get(store.view).histories.size).toBe(0);
    expect(reads).toBe(2);
    expect(releases).toBe(2);
  });
}
test("unchanged unresolved buffered gap stops after one followup without advancing cursor", async () => {
  const store = createConversationStore({ initial: [], actor });
  const live: { receive: (m: Message) => void } = { receive: () => {} };
  let reads = 0;
  await store.synchronize(
    { actor, conversationId: "c" },
    {
      subscribe: async (_id, receive) => {
        live.receive = receive;
        return () => {};
      },
      history: async () => {
        reads++;
        live.receive(message(4));
        if (reads > 2) throw Error("Unbounded unresolved catch-up");
        return reads === 1 ? page([1, 2]) : page([], 2);
      },
      merge: mergeMessages,
    },
  );
  expect(reads).toBe(2);
  expect(get(store.view).histories.get("c")?.verifiedCursor).toBe(2);
  expect(get(store.view).histories.get("c")?.status).toBe("ready");
  expect(
    get(store.view)
      .histories.get("c")
      ?.items.map((m) => m.sequence),
  ).toEqual([1, 2, 4]);
  store.clear();
});
for (const outcome of ["success", "rejection"] as const) {
  test(`review N1 never revives stale earlier ${outcome} after sync and new earlier in the same actor epoch`, async () => {
    const store = createConversationStore({ initial: [], actor });
    store.hydrate({
      actor,
      conversationId: "c",
      history: page([51, 52], 50, "older"),
    });
    const reached = Promise.withResolvers<void>();
    const held = Promise.withResolvers<History>();
    const stale = store.earlier({ actor, conversationId: "c" }, async () => {
      reached.resolve();
      return held.promise;
    });
    await reached.promise;
    await store.synchronize(
      { actor, conversationId: "c" },
      {
        subscribe: async () => () => {},
        history: async () => page([], 52),
        merge: mergeMessages,
      },
    );
    await store.earlier({ actor, conversationId: "c" }, async () =>
      page([49, 50], 48, "current-cursor"),
    );
    expect(get(store.view).histories.get("c")?.status).toBe("ready");
    if (outcome === "success") held.resolve(page([47, 48], 46, "stale-cursor"));
    else held.reject(new Error("Stale earlier transport failure"));
    await stale;
    const current = get(store.view).histories.get("c");
    expect(current?.status).toBe("ready");
    expect(current?.issue).toBeUndefined();
    expect(current?.earlierCursor).toBe("current-cursor");
    expect(current?.items.map(({ sequence }) => sequence)).toEqual([
      49, 50, 51, 52,
    ]);
    expect(current?.verifiedCursor).toBe(52);
    expect(get(store.view).actor).toEqual(actor);
    store.clear();
  });
}
