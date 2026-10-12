import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createConversationStore } from "../../../apps/fe-insta/src/domains/conversations/browser/index";
import { createConversationSubscription } from "../../../apps/fe-insta/src/domains/conversations/browser/realtime/index";
import { createSubscriptionServer } from "../../fixtures/realtime/subscriptions";

const actor = { userId: "alice", generation: "login1" };
const message = {
  id: "message",
  conversationId: "conversation-a",
  authorId: "alice",
  clientMessageId: "client",
  text: "hello",
  sequence: 1,
  createdAt: "2026-10-10T00:00:00.000Z",
};
test("subscription routes matching events and closes the last receiver once", async () => {
  const server = createSubscriptionServer();
  const store = createConversationStore({ actor, initial: [] });
  const subscription = createConversationSubscription({
    actor,
    store,
    command: server.command,
    connected: () => true,
    online: () => true,
  });
  const first: string[] = [];
  const second: string[] = [];
  const a = await subscription.subscribe("conversation-a", (value) =>
    first.push(value.id),
  );
  const b = await subscription.subscribe("conversation-a", (value) =>
    second.push(value.id),
  );
  const prepared = server.slots.get("conversation-a");
  if (!prepared) throw new Error("missing prepared");
  const event = {
    version: 1,
    kind: "event",
    type: "messages.created",
    eventId: crypto.randomUUID(),
    occurredAt: message.createdAt,
    meta: { requestId: crypto.randomUUID() },
    data: { message },
    delivery: {
      subscriptionId: prepared.subscriptionId,
      ...prepared.baseline,
      cursor: 1,
    },
  } as const;
  await subscription.handlers["messages.created"](event);
  await subscription.handlers["messages.created"]({
    ...event,
    data: { message: { ...message, conversationId: "conversation-b" } },
  });
  expect(first).toEqual(["message"]);
  expect(second).toEqual(["message"]);
  await a();
  expect(server.commands.map((value) => value.type)).toEqual([
    "conversations.subscribe",
  ]);
  await subscription.handlers["messages.created"](event);
  expect(first).toEqual(["message"]);
  expect(second).toEqual(["message", "message"]);
  await b();
  expect(server.commands.map((value) => value.type)).toEqual([
    "conversations.subscribe",
    "conversations.unsubscribe",
  ]);
  expect(server.slots.size).toBe(0);
});
test("generation loss rejects late token while retained projection can reconnect", async () => {
  const server = createSubscriptionServer();
  const store = createConversationStore({ actor, initial: [] });
  const received: string[] = [];
  const subscription = createConversationSubscription({
    actor,
    store,
    command: server.command,
    connected: () => true,
    online: () => false,
  });
  const release = await subscription.subscribe("conversation-a", (value) =>
    received.push(value.id),
  );
  await release.activate?.();
  const prepared = server.slots.get("conversation-a");
  if (!prepared) throw new Error("missing prepared");
  const event = {
    version: 1,
    kind: "event",
    type: "messages.created",
    eventId: crypto.randomUUID(),
    occurredAt: message.createdAt,
    meta: { requestId: crypto.randomUUID() },
    data: { message },
    delivery: {
      subscriptionId: prepared.subscriptionId,
      ...prepared.baseline,
      cursor: 1,
    },
  } as const;
  subscription.onGenerationLost();
  expect(
    await subscription.delivery.receive({ kind: "single", event }, () => true),
  ).toBeNull();
  expect(received).toEqual([]);
  expect(get(store.view).connection).toBe("offline");
  await release();
});
