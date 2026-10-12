import { expect, test } from "bun:test";
import {
  applyDelivery,
  applyUnreadBatch,
} from "../../../apps/fe-insta/src/lib/realtime/delivery/apply";
import { DeliveryCursorStore } from "../../../apps/fe-insta/src/lib/realtime/delivery/state";
import type { Event } from "../../../apps/fe-insta/src/lib/realtime/types";

const identity = {
  subscriptionId: crypto.randomUUID(),
  baseline: { streamId: "unread:alice", epoch: crypto.randomUUID(), cursor: 0 },
};
const event = (cursor: number): Event => ({
  version: 1,
  kind: "event",
  type: "conversations.unread.changed",
  eventId: crypto.randomUUID(),
  occurredAt: "2026-10-20T00:00:00.000Z",
  meta: { requestId: crypto.randomUUID() },
  data: { conversationId: "conv_one" },
  delivery: {
    subscriptionId: identity.subscriptionId,
    ...identity.baseline,
    cursor,
  },
});
test("concurrent duplicate commits one effect but returns two applied callbacks", async () => {
  const state = new DeliveryCursorStore();
  state.bind(identity);
  const wait = Promise.withResolvers<void>();
  let calls = 0;
  const value = event(1);
  const apply = () =>
    applyDelivery(
      {
        event: value,
        currentActor: () => true,
        apply: async () => {
          calls++;
          await wait.promise;
          return "applied";
        },
      },
      state,
    );
  const a = apply();
  const b = apply();
  await Promise.resolve();
  expect(calls).toBe(1);
  wait.resolve();
  expect((await a)?.reply.kind).toBe("applied");
  expect((await b)?.reply.kind).toBe("applied");
  expect(calls).toBe(1);
});
test("failed async handler and stale actor never advance cursor", async () => {
  for (const stale of [false, true]) {
    const state = new DeliveryCursorStore();
    state.bind(identity);
    let active = true;
    const result = await applyDelivery(
      {
        event: event(1),
        currentActor: () => active,
        apply: async () => {
          if (stale) active = false;
          throw new Error("broken");
        },
      },
      state,
    );
    expect(result?.reply.kind ?? null).toBe(stale ? null : "apply-failed");
    expect(state.position()?.cursor).toBe(0);
  }
});
test("640 invalidations in batches64 read canonical state ten times and replay reads zero", async () => {
  const state = new DeliveryCursorStore();
  state.bind(identity);
  let reads = 0;
  const batches = Array.from({ length: 10 }, (_, batch) =>
    Array.from({ length: 64 }, (_, index) => event(batch * 64 + index + 1)),
  );
  for (const events of [...batches, ...batches]) {
    const result = await applyUnreadBatch(
      {
        events,
        currentActor: () => true,
        apply: async () => {
          reads++;
          return "applied";
        },
      },
      state,
    );
    expect(result?.reply.kind).toBe("applied");
    expect(result?.reply.position.cursor).toBe(events.at(-1)?.delivery.cursor);
  }
  expect(reads).toBe(10);
  expect(state.position()?.cursor).toBe(640);
});
test("partial replay applies only uncommitted suffix and rebound token fences old async work", async () => {
  const state = new DeliveryCursorStore();
  state.bind(identity);
  await applyDelivery(
    { event: event(1), currentActor: () => true, apply: async () => "applied" },
    state,
  );
  const seen: number[] = [];
  await applyUnreadBatch(
    {
      events: [event(1), event(2), event(3)],
      currentActor: () => true,
      apply: async (events) => {
        seen.push(...events.map((e) => e.delivery.cursor));
        return "applied";
      },
    },
    state,
  );
  expect(seen).toEqual([2, 3]);
  const wait = Promise.withResolvers<void>();
  const pending = applyDelivery(
    {
      event: event(4),
      currentActor: () => true,
      apply: async () => {
        await wait.promise;
        return "applied";
      },
    },
    state,
  );
  await Promise.resolve();
  state.lost();
  state.bind({
    ...identity,
    subscriptionId: crypto.randomUUID(),
    baseline: { ...identity.baseline, cursor: 3 },
  });
  wait.resolve();
  expect(await pending).toBeNull();
  expect(state.position()?.cursor).toBe(3);
});

test("one business event ID applies independently to message and unread projections", async () => {
  const unreadEvent = event(1);
  const messageIdentity = {
    subscriptionId: crypto.randomUUID(),
    baseline: {
      streamId: "conversation:conv_one",
      epoch: crypto.randomUUID(),
      cursor: 0,
    },
  };
  const messageEvent: Event = {
    ...unreadEvent,
    type: "messages.created",
    data: {
      message: {
        id: "message-one",
        conversationId: "conv_one",
        authorId: "peer",
        text: "hello",
        sequence: 1,
        createdAt: "2026-10-20T00:00:00Z",
      },
    },
    delivery: {
      subscriptionId: messageIdentity.subscriptionId,
      ...messageIdentity.baseline,
      cursor: 1,
    },
  };
  const unreadState = new DeliveryCursorStore();
  unreadState.bind(identity);
  const messageState = new DeliveryCursorStore();
  messageState.bind(messageIdentity);
  const applied: string[] = [];
  for (const [value, state] of [
    [messageEvent, messageState],
    [unreadEvent, unreadState],
  ] as const) {
    const result = await applyDelivery(
      {
        event: value,
        currentActor: () => true,
        apply: async () => {
          applied.push(value.type);
          return "applied";
        },
      },
      state,
    );
    expect(result?.reply.kind).toBe("applied");
  }
  expect(applied).toEqual(["messages.created", "conversations.unread.changed"]);
});
