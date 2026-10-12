import { expect, test } from "bun:test";
import {
  createConversationSession,
  createConversationStore,
} from "../../../apps/fe-insta/src/domains/conversations/browser/index";
import { createConversationSubscription } from "../../../apps/fe-insta/src/domains/conversations/browser/realtime/index";

const actor = { userId: "alice", generation: "one" };
test("canonical snapshot follows prepare and exact activation follows installed history", async () => {
  const store = createConversationStore({ actor, initial: [] });
  const order: string[] = [];
  const prepared = {
    subscriptionId: crypto.randomUUID(),
    baseline: {
      streamId: "conversation:c1",
      epoch: crypto.randomUUID(),
      cursor: 0,
    },
  };
  const subscription = createConversationSubscription({
    actor,
    store,
    connected: () => true,
    online: () => true,
    command: async (command) => {
      order.push(command.type);
      return {
        version: 1,
        kind: "ack",
        ok: true,
        meta: command.meta,
        data:
          command.type === "conversations.subscribe"
            ? { ...prepared, conversationId: "c1" }
            : prepared,
      };
    },
  });
  const session = createConversationSession({
    actor,
    store,
    currentActor: () => actor,
    subscribe: subscription.subscribe,
    history: async () => {
      order.push("snapshot");
      return {
        items: [],
        baselineCursor: 0,
        watermark: 0,
        pageInfo: { hasMore: false, nextCursor: null },
      };
    },
    start: async () => {
      throw new Error("unused");
    },
    openConversation: async () => {},
  });
  await session.synchronize("c1");
  expect(order).toEqual([
    "conversations.subscribe",
    "snapshot",
    "conversations.activate",
  ]);
  store.clear();
});
