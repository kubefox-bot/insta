import { expect, test } from "bun:test";
import { get } from "svelte/store";
import {
  createConversationSession,
  createConversationStore,
} from "../../../apps/fe-insta/src/domains/conversations/browser/state/index";

test("late start result cannot navigate or repopulate private dialogue after login generation changes", async () => {
  const actor = { userId: "alice", generation: "login1" };
  const store = createConversationStore({ initial: [], actor });
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const visited: string[] = [];
  const session = createConversationSession({
    actor,
    store,
    currentActor: () => get(store.view).actor,
    subscribe: async () => () => {},
    history: async () => ({
      items: [],
      baselineCursor: 0,
      watermark: 0,
      pageInfo: { hasMore: false, nextCursor: null },
    }),
    start: async () => {
      reached.resolve();
      await release.promise;
      return {
        conversation: {
          id: "c",
          participantIds: ["alice", "bob"],
          lastSequence: 0,
          lastActivityAt: 0,
        },
      };
    },
    openConversation: async ({ conversationId }) => {
      visited.push(conversationId);
    },
  });
  const pending = session.open("bob");
  await reached.promise;
  store.reconcileActor({ ...actor, generation: "login2" });
  release.resolve();
  await pending.catch(() => {});
  expect(visited).toEqual([]);
  expect(get(store.view).conversations).toEqual([]);
});

test("session passes conversation identity to host navigation and rejects changed actor before start or target open", async () => {
  const actor = { userId: "alice", generation: "login1" };
  const store = createConversationStore({ initial: [], actor });
  const visited: Readonly<{ conversationId: string }>[] = [];
  let starts = 0;
  const session = createConversationSession({
    actor,
    store,
    currentActor: () => get(store.view).actor,
    subscribe: async () => () => {},
    history: async () => ({
      items: [],
      baselineCursor: 0,
      watermark: 0,
      pageInfo: { hasMore: false, nextCursor: null },
    }),
    start: async () => {
      starts++;
      return {
        conversation: {
          id: "created",
          participantIds: ["alice", "bob"],
          lastSequence: 0,
          lastActivityAt: 0,
        },
      };
    },
    openConversation: async (input) => {
      visited.push(input);
    },
  });
  await session.open("bob");
  await session.openTarget({ conversationId: "existing" });
  expect(visited).toEqual([
    { conversationId: "created" },
    { conversationId: "existing" },
  ]);
  expect(get(store.view).conversations[0]?.id).toBe("created");
  store.reconcileActor({ ...actor, generation: "login2" });
  await expect(session.open("bob")).rejects.toThrow("ACTOR_CHANGED");
  await expect(
    session.openTarget({ conversationId: "existing" }),
  ).rejects.toThrow("ACTOR_CHANGED");
  expect(starts).toBe(1);
  expect(visited).toHaveLength(2);
});
