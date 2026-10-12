import { expect, jest, test } from "bun:test";
import { eventSchema, RealtimeErrorCode } from "@insta/contracts/realtime";
import { get } from "svelte/store";
import { createSubscriptionServer } from "../../../../__tests__/fixtures/realtime/subscriptions";
import { ConversationRequestError } from "../../src/domains/conversations/browser/lib/http/request-error";
import { createUnreadSummary } from "../../src/domains/conversations/browser/unread/create";
import { createUnreadSubscription } from "../../src/domains/conversations/browser/unread/realtime";
import type { UnreadList } from "../../src/domains/conversations/browser/unread/types";

const actor = { userId: "alice", generation: "login1" };
const changed = (
  server: ReturnType<typeof createSubscriptionServer>,
  cursor = 1,
) => {
  const prepared = server.slots.get("#unread");
  if (!prepared) throw new Error("missing subscription");
  const event = eventSchema.parse({
    version: 1,
    kind: "event",
    type: "conversations.unread.changed",
    eventId: crypto.randomUUID(),
    occurredAt: "2026-10-12T00:00:00.000Z",
    data: { conversationId: "conv_one" },
    meta: { requestId: crypto.randomUUID() },
    delivery: {
      subscriptionId: prepared.subscriptionId,
      ...prepared.baseline,
      cursor,
    },
  });
  if (event.type !== "conversations.unread.changed")
    throw new Error("wrong fixture");
  return event;
};
test("snapshot is read after prepare, delivery during snapshot is retryable, replay applies once", async () => {
  const loaded = Promise.withResolvers<void>();
  const snapshot = Promise.withResolvers<UnreadList>();
  let reads = 0;
  const server = createSubscriptionServer();
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads++;
      if (reads === 1) {
        loaded.resolve();
        return snapshot.promise;
      }
      return { items: [], totalUnreadCount: 2 };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  const ready = subscription.connected();
  await loaded.promise;
  const event = changed(server);
  expect((await subscription.receive(event))?.reply.kind).toBe("retry-later");
  expect(reads).toBe(1);
  snapshot.resolve({ items: [], totalUnreadCount: 1 });
  await ready;
  expect((await subscription.receive(event))?.reply.kind).toBe("applied");
  expect((await subscription.receive(event))?.reply.kind).toBe("applied");
  expect(reads).toBe(2);
  expect(get(unread.view).list?.totalUnreadCount).toBe(2);
  subscription.dispose();
  unread.dispose();
});
test("lost prepare ACK retries reuse paused token; ensure coalesces and reconnect resumes retained cursor", async () => {
  let lose = true;
  const server = createSubscriptionServer({
    after: async (command) => {
      if (command.type === "conversations.unread.subscribe" && lose) {
        lose = false;
        throw new Error("lost ACK");
      }
    },
  });
  let reads = 0;
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads++;
      return { items: [] };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  await expect(subscription.connected()).rejects.toThrow("lost ACK");
  const token = server.slots.get("#unread")?.subscriptionId;
  await subscription.ensure();
  expect(server.slots.get("#unread")?.subscriptionId).toBe(token);
  expect(server.slots.size).toBe(1);
  expect(reads).toBe(1);
  const count = server.commands.length;
  await subscription.ensure();
  expect(server.commands).toHaveLength(count);
  const event = changed(server);
  await subscription.receive(event);
  subscription.lost();
  server.slots.clear();
  await subscription.connected();
  const resume = server.commands
    .filter((command) => command.type === "conversations.unread.subscribe")
    .at(-1);
  expect(resume?.data).toEqual({
    resume: {
      streamId: event.delivery.streamId,
      epoch: event.delivery.epoch,
      cursor: 1,
    },
  });
  subscription.dispose();
  await subscription.ensure();
  expect(server.slots.size).toBe(1);
  unread.dispose();
});
test("generation loss fences old prepare ACK and another account never receives its snapshot", async () => {
  const started = Promise.withResolvers<void>();
  const held = Promise.withResolvers<void>();
  let reads = 0;
  const server = createSubscriptionServer({
    before: async () => {
      started.resolve();
      await held.promise;
    },
  });
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads++;
      return { items: [] };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  const pending = subscription.connected();
  await started.promise;
  subscription.dispose();
  unread.reconcileActor({ ...actor, generation: "two" });
  held.resolve();
  await pending;
  expect(reads).toBe(0);
  expect(get(unread.view).list).toBeNull();
  unread.dispose();
});
test.each(["503", "429", "network", "timeout"])(
  "more than five %s failures preserve coordinate and WS replay succeeds without manual action",
  async (failure) => {
    if (failure === "timeout") jest.useFakeTimers();
    let reads = 0;
    let entered = Promise.withResolvers<void>();
    const server = createSubscriptionServer();
    const unread = createUnreadSummary({
      visible: () => true,
      load: async (_actor, signal) => {
        reads++;
        if (reads > 1 && reads < 8) {
          entered.resolve();
          if (failure === "timeout")
            return new Promise<UnreadList>((_resolve, reject) =>
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              }),
            );
          if (failure === "network") throw new TypeError("network unavailable");
          throw new ConversationRequestError(Number(failure), 2000, "busy");
        }
        return { items: [], totalUnreadCount: reads };
      },
    });
    unread.reconcileActor(actor);
    const subscription = createUnreadSubscription({
      unread,
      uuid: () => crypto.randomUUID(),
      command: server.command,
    });
    try {
      await subscription.connected();
      const event = changed(server);
      for (let i = 0; i < 6; i++) {
        entered = Promise.withResolvers<void>();
        const pending = subscription.receive(event);
        await entered.promise;
        if (failure === "timeout") jest.advanceTimersByTime(10000);
        const result = await pending;
        expect(result?.reply).toEqual({
          kind: "retry-later",
          position: event.delivery,
          ...(["503", "429"].includes(failure) ? { retryAfterMs: 2000 } : {}),
        });
      }
      expect((await subscription.receive(event))?.reply.kind).toBe("applied");
      expect((await subscription.receive(event))?.reply.kind).toBe("applied");
      expect(reads).toBe(8);
      expect(get(unread.view).stale).toBe(false);
    } finally {
      subscription.dispose();
      unread.dispose();
      if (failure === "timeout") jest.useRealTimers();
    }
  },
);
test("late failed canonical read cannot consume replay in a newer subscription attempt", async () => {
  const pending = Promise.withResolvers<UnreadList>();
  const entered = Promise.withResolvers<void>();
  let reads = 0;
  const server = createSubscriptionServer();
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads++;
      if (reads === 2) {
        entered.resolve();
        return pending.promise;
      }
      return { items: [] };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  await subscription.connected();
  const event = changed(server);
  const first = subscription.receive(event);
  await entered.promise;
  subscription.lost();
  pending.reject(new TypeError("old network failure"));
  expect(await first).toBeNull();
  server.slots.clear();
  await subscription.connected();
  const next = {
    ...event,
    delivery: {
      ...event.delivery,
      subscriptionId: server.slots.get("#unread")?.subscriptionId ?? "",
    },
  };
  expect((await subscription.receive(next))?.reply.kind).toBe("applied");
  expect((await subscription.receive(next))?.reply.kind).toBe("applied");
  subscription.dispose();
  unread.dispose();
});
test("blocked unread notice remains visible until explicit retry, duplicate notice has no bootstrap effect", async () => {
  let reads = 0;
  const server = createSubscriptionServer();
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads++;
      return { items: [] };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  await subscription.connected();
  const event = changed(server);
  const { cursor: _cursor, ...identity } = event.delivery;
  const notice = {
    version: 1,
    kind: "delivery-notice",
    ...identity,
    code: RealtimeErrorCode.DeliveryBlocked,
  } as const;
  expect(subscription.delivery.notice(notice, () => true)?.receipt).toEqual(
    notice,
  );
  expect(
    subscription.delivery.notice(notice, () => true)?.afterReply,
  ).toBeUndefined();
  await subscription.ensure();
  expect(reads).toBe(1);
  expect(get(unread.view).issue).toBe(RealtimeErrorCode.DeliveryBlocked);
  subscription.lost();
  server.slots.clear();
  await subscription.connected();
  expect(reads).toBe(1);
  expect(get(unread.view).issue).toBe(RealtimeErrorCode.DeliveryBlocked);
  subscription.retry();
  subscription.retry();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(reads).toBe(2);
  expect(get(unread.view).issue).toBeUndefined();
  subscription.dispose();
  unread.dispose();
});

test("failed initial snapshot has no resumable projection after transport loss", async () => {
  let fail = true;
  const server = createSubscriptionServer();
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      if (fail) throw new Error("snapshot failure");
      return { items: [] };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  await expect(subscription.connected()).rejects.toThrow();
  subscription.lost();
  server.slots.clear();
  fail = false;
  await subscription.connected();
  expect(
    server.commands
      .filter((command) => command.type === "conversations.unread.subscribe")
      .at(-1)?.data,
  ).toEqual({});
  subscription.dispose();
  unread.dispose();
});

test("unread interrupted resync resumes on a new transport while stale notice cannot re-block it", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let hold = true;
  let reads = 0;
  const server = createSubscriptionServer({
    before: async (command) => {
      if (hold && command.type === "conversations.unread.unsubscribe") {
        entered.resolve();
        await release.promise;
      }
    },
  });
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads++;
      return { items: [], totalUnreadCount: reads };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  await subscription.connected();
  const old = changed(server).delivery;
  const notice = {
    version: 1,
    kind: "delivery-notice",
    subscriptionId: old.subscriptionId,
    streamId: old.streamId,
    epoch: old.epoch,
    code: RealtimeErrorCode.ResyncRequired,
  } as const;
  subscription.delivery.notice(notice, () => true)?.afterReply?.();
  await entered.promise;
  subscription.lost();
  server.slots.clear();
  hold = false;
  release.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await subscription.connected();
  expect(reads).toBe(2);
  expect(get(unread.view).issue).toBeUndefined();
  expect(subscription.delivery.notice(notice, () => true)).toBeNull();
  expect((await subscription.receive(changed(server)))?.reply.kind).toBe(
    "applied",
  );
  subscription.dispose();
  unread.dispose();
});

test("failed unread resync snapshot stays explicit-only across foreground and reconnect", async () => {
  let reads = 0;
  let fail = true;
  const server = createSubscriptionServer();
  const unread = createUnreadSummary({
    visible: () => true,
    load: async () => {
      reads++;
      if (reads > 1 && fail) throw new Error("snapshot unavailable");
      return { items: [] };
    },
  });
  unread.reconcileActor(actor);
  const subscription = createUnreadSubscription({
    unread,
    uuid: () => crypto.randomUUID(),
    command: server.command,
  });
  await subscription.connected();
  const { cursor: _cursor, ...identity } = changed(server).delivery;
  const notice = {
    version: 1,
    kind: "delivery-notice",
    ...identity,
    code: RealtimeErrorCode.ResyncRequired,
  } as const;
  subscription.delivery.notice(notice, () => true)?.afterReply?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(reads).toBe(2);
  expect(get(unread.view).issue).toBe(RealtimeErrorCode.ResyncRequired);
  fail = false;
  await subscription.ensure();
  subscription.lost();
  server.slots.clear();
  await subscription.connected();
  expect(reads).toBe(2);
  subscription.retry();
  subscription.retry();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(reads).toBe(3);
  expect(get(unread.view).issue).toBeUndefined();
  subscription.dispose();
  unread.dispose();
});
