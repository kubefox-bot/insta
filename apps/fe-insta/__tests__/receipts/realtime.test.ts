import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createSubscriptionServer } from "../../../../__tests__/fixtures/realtime/subscriptions";
import { createConversationSubscription } from "../../src/domains/conversations/browser/realtime/index";
import { createConversationStore } from "../../src/domains/conversations/browser/state/index";

const actor = { userId: "sender", generation: "login1" };
const conversationId = "c".repeat(24);
const snapshot = {
  conversationId,
  receipts: [
    {
      messageId: "m",
      recipientId: "peer",
      sequence: 1,
      deliveredAt: "2026-10-11T10:00:00.000Z",
      readAt: "2026-10-11T10:00:01.000Z",
    },
  ],
};
const event = {
  version: 1,
  kind: "event",
  type: "messages.receipts.updated",
  eventId: crypto.randomUUID(),
  occurredAt: "2026-10-11T10:00:01.000Z",
  data: snapshot,
  meta: { requestId: crypto.randomUUID() },
  delivery: {
    subscriptionId: crypto.randomUUID(),
    streamId: conversationId,
    epoch: crypto.randomUUID(),
    cursor: 1,
  },
} as const;
test("subscribed realtime receipt-before-history is accepted; late generation events are fenced", async () => {
  const store = createConversationStore({ actor, initial: [] });
  const subscription = createConversationSubscription({
    actor,
    store,
    online: () => true,
    connected: () => true,
    command: createSubscriptionServer().command,
  });
  await subscription.subscribe(conversationId, () => {});
  await subscription.handlers["messages.receipts.updated"](event);
  const history = {
    items: [
      {
        id: "m",
        conversationId,
        authorId: "sender",
        text: "hello",
        sequence: 1,
        createdAt: "2026-10-11T10:00:00.000Z",
      },
    ],
    baselineCursor: 0,
    watermark: 1,
    pageInfo: { hasMore: false, nextCursor: null },
  };
  store.hydrate({ actor, conversationId, history });
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt?.readAt,
  ).toBe("2026-10-11T10:00:01.000Z");
  const next = { ...actor, generation: "login2" };
  store.reconcileActor(next);
  await subscription.handlers["messages.receipts.updated"](event);
  store.hydrate({ actor: next, conversationId, history });
  expect(
    get(store.view).histories.get(conversationId)?.items[0]?.receipt,
  ).toBeUndefined();
  subscription.onGenerationLost();
  store.clear();
});
