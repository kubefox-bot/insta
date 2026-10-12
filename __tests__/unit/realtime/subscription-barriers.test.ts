import { expect, test } from "bun:test";
import {
  type DeliveryNotice,
  type DeliveryUnit,
  RealtimeErrorCode,
} from "@insta/contracts/realtime";
import { get } from "svelte/store";
import {
  createConversationSession,
  createConversationStore,
} from "../../../apps/fe-insta/src/domains/conversations/browser/index";
import { createConversationSubscription } from "../../../apps/fe-insta/src/domains/conversations/browser/realtime/index";
import { createSubscriptionServer } from "../../fixtures/realtime/subscriptions";

const actor = { userId: "alice", generation: "one" };
const history = {
  items: [],
  baselineCursor: 0,
  watermark: 0,
  pageInfo: { hasMore: false, nextCursor: null },
};
const createHost = (
  server: ReturnType<typeof createSubscriptionServer>,
  load: () => Promise<typeof history> = async () => history,
) => {
  const store = createConversationStore({ actor, initial: [] });
  const subscription = createConversationSubscription({
    actor,
    store,
    command: server.command,
    online: () => true,
    connected: () => true,
    recover: (id) => session.synchronize(id),
  });
  const session = createConversationSession({
    actor,
    store,
    currentActor: () => actor,
    subscribe: subscription.subscribe,
    history: load,
    start: async () => {
      throw new Error("unused");
    },
    openConversation: async () => {},
  });
  return { store, subscription, session };
};
test.each([false, true])(
  "sixth history waits for actual unsubscribe ACK before prepare; prehydrated=%s",
  async (prehydrated) => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const server = createSubscriptionServer({
      before: async (command) => {
        if (
          command.type === "conversations.unsubscribe" &&
          command.data.conversationId === "c0"
        ) {
          entered.resolve();
          await release.promise;
        }
      },
    });
    await server.command({
      version: 1,
      kind: "command",
      type: "conversations.unread.subscribe",
      data: {},
      meta: { requestId: crypto.randomUUID() },
    });
    const { store, session, subscription } = createHost(server);
    for (let index = 0; index < 5; index++)
      expect((await session.synchronize(`c${index}`)).kind).toBe("applied");
    expect(server.slots.size).toBe(6);
    const old = server.slots.get("c0");
    if (!old) throw new Error("missing old slot");
    if (prehydrated) store.hydrate({ actor, conversationId: "c5", history });
    const opening = session.synchronize("c5");
    await entered.promise;
    expect(
      server.commands.filter(
        (command) => command.type === "conversations.subscribe",
      ),
    ).toHaveLength(5);
    expect(get(store.view).histories.size).toBe(5);
    const notice: DeliveryNotice = {
      version: 1,
      kind: "delivery-notice",
      subscriptionId: old.subscriptionId,
      streamId: old.baseline.streamId,
      epoch: old.baseline.epoch,
      code: RealtimeErrorCode.ResyncRequired,
    };
    expect(subscription.delivery.notice(notice, () => true)).toBeNull();
    release.resolve();
    expect((await opening).kind).toBe("applied");
    expect(server.maxSlots()).toBe(6);
    expect(server.slots.has("c0")).toBe(false);
    expect(server.slots.has("c5")).toBe(true);
    expect(get(store.view).histories.size).toBe(5);
    await subscription.dispose();
  },
);
test("F2 overflow returns retry-later before cleanup, coalesces resync, and failed snapshot remains visible", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let reads = 0;
  let unavailable = true;
  const server = createSubscriptionServer({
    before: async (command) => {
      if (command.type === "conversations.unsubscribe") {
        entered.resolve();
        await release.promise;
      }
    },
  });
  const { store, session, subscription } = createHost(server, async () => {
    reads++;
    if (reads > 1 && unavailable) throw new Error("snapshot unavailable");
    return history;
  });
  await session.synchronize("c1");
  const prepared = server.slots.get("c1");
  if (!prepared) throw new Error("missing slot");
  const event = {
    version: 1,
    kind: "event",
    type: "messages.receipts.updated",
    eventId: crypto.randomUUID(),
    occurredAt: "2026-10-20T00:00:00.000Z",
    meta: { requestId: crypto.randomUUID() },
    delivery: {
      subscriptionId: prepared.subscriptionId,
      ...prepared.baseline,
      cursor: 1,
    },
    data: {
      conversationId: "c1",
      receipts: Array.from({ length: 51 }, (_, index) => ({
        messageId: `m${index}`,
        recipientId: "alice",
        sequence: index + 1,
        deliveredAt: null,
        readAt: null,
      })),
    },
  } as const;
  const result = await subscription.delivery.receive(
    { kind: "single", event },
    () => true,
  );
  expect(result?.reply.kind).toBe("retry-later");
  expect(
    server.commands.filter(
      (command) => command.type === "conversations.unsubscribe",
    ),
  ).toHaveLength(0);
  const duplicate = await subscription.delivery.receive(
    { kind: "single", event },
    () => true,
  );
  expect(duplicate?.reply.kind).toBe("retry-later");
  expect(duplicate?.afterReply).toBeUndefined();
  result?.afterReply?.();
  await entered.promise;
  expect(reads).toBe(1);
  release.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(reads).toBe(2);
  expect(get(store.view).histories.get("c1")?.deliveryIssue).toBe(
    RealtimeErrorCode.ResyncRequired,
  );
  const prepares = server.commands.filter(
    (command) => command.type === "conversations.subscribe",
  ).length;
  unavailable = false;
  subscription.onGenerationLost();
  server.slots.clear();
  expect((await session.synchronize("c1")).kind).toBe("failed");
  expect(reads).toBe(2);
  subscription.retry("c1");
  subscription.retry("c1");
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(reads).toBe(3);
  expect(
    server.commands.filter(
      (command) => command.type === "conversations.subscribe",
    ),
  ).toHaveLength(prepares + 1);
  expect(get(store.view).histories.get("c1")?.deliveryIssue).toBeUndefined();
  const current = server.slots.get("c1");
  if (!current) throw new Error("Missing recovered slot");
  const next = {
    ...event,
    delivery: {
      subscriptionId: current.subscriptionId,
      ...current.baseline,
      cursor: 1,
    },
    data: { conversationId: "c1", receipts: [] },
  };
  expect(
    (
      await subscription.delivery.receive(
        { kind: "single", event: next },
        () => true,
      )
    )?.reply.kind,
  ).toBe("applied");
  await subscription.dispose();
});
test("blocked notice stops only its history; explicit retry bootstraps once and duplicate old notice is stale", async () => {
  let reads = 0;
  const server = createSubscriptionServer();
  const { store, session, subscription } = createHost(server, async () => {
    reads++;
    return history;
  });
  await session.synchronize("c1");
  await session.synchronize("c2");
  const prepared = server.slots.get("c1");
  if (!prepared) throw new Error("missing slot");
  const notice: DeliveryNotice = {
    version: 1,
    kind: "delivery-notice",
    subscriptionId: prepared.subscriptionId,
    streamId: prepared.baseline.streamId,
    epoch: prepared.baseline.epoch,
    code: RealtimeErrorCode.DeliveryBlocked,
  };
  expect(subscription.delivery.notice(notice, () => true)?.receipt).toEqual(
    notice,
  );
  expect(
    subscription.delivery.notice(notice, () => true)?.afterReply,
  ).toBeUndefined();
  expect(reads).toBe(2);
  expect(get(store.view).histories.get("c1")?.deliveryIssue).toBe(
    RealtimeErrorCode.DeliveryBlocked,
  );
  expect(get(store.view).histories.get("c2")?.deliveryIssue).toBeUndefined();
  subscription.retry("c1");
  subscription.retry("c1");
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(reads).toBe(3);
  expect(get(store.view).histories.get("c1")?.deliveryIssue).toBeUndefined();
  expect(subscription.delivery.notice(notice, () => true)).toBeNull();
  expect(server.slots.has("c2")).toBe(true);
  await subscription.dispose();
});

test("wrong unsubscribe target cannot release a slot for the next prepare", async () => {
  const server = createSubscriptionServer();
  const store = createConversationStore({ actor, initial: [] });
  const subscription = createConversationSubscription({
    actor,
    store,
    connected: () => true,
    online: () => true,
    command: async (command) =>
      command.type === "conversations.unsubscribe"
        ? {
            version: 1,
            kind: "ack",
            ok: true,
            meta: command.meta,
            data: { conversationId: "another" },
          }
        : server.command(command),
  });
  const release = await subscription.subscribe("c1", () => {});
  await expect(release()).rejects.toThrow("Unexpected unsubscribe target");
  await expect(subscription.subscribe("c2", () => {})).rejects.toThrow(
    "Unexpected unsubscribe target",
  );
  expect(server.slots.has("c2")).toBe(false);
});

test("eviction closes an admitted subscription whose canonical snapshot is still pending", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let reads = 0;
  const server = createSubscriptionServer();
  await server.command({
    version: 1,
    kind: "command",
    type: "conversations.unread.subscribe",
    data: {},
    meta: { requestId: crypto.randomUUID() },
  });
  const { store, session, subscription } = createHost(server, async () => {
    reads++;
    if (reads === 1) {
      entered.resolve();
      await release.promise;
    }
    return history;
  });
  const first = session.synchronize("c0");
  await entered.promise;
  for (let index = 1; index < 5; index++)
    await session.synchronize(`c${index}`);
  try {
    expect((await session.synchronize("c5")).kind).toBe("applied");
    expect(server.maxSlots()).toBe(6);
    expect(get(store.view).histories.has("c0")).toBe(false);
  } finally {
    release.resolve();
    await first;
    await subscription.dispose();
  }
});

test("dispose waits for a released history's pending unsubscribe ACK", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = createSubscriptionServer({
    before: async (command) => {
      if (command.type === "conversations.unsubscribe") {
        entered.resolve();
        await release.promise;
      }
    },
  });
  const { session, store, subscription } = createHost(server);
  await session.synchronize("c");
  store.clear();
  await entered.promise;
  let disposed = false;
  const completion = subscription.dispose().then(() => {
    disposed = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    expect(disposed).toBe(false);
  } finally {
    release.resolve();
    await completion;
  }
  expect(server.slots.size).toBe(0);
});

test("duplicate current resync notices return receipts before one owned canonical bootstrap", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const activated = Promise.withResolvers<void>();
  let activations = 0;
  const order: string[] = [];
  const server = createSubscriptionServer({
    before: async (command) => {
      order.push(command.type);
      if (command.type === "conversations.unsubscribe") {
        entered.resolve();
        await release.promise;
      }
    },
    after: async (command) => {
      if (command.type === "conversations.activate" && ++activations === 2)
        activated.resolve();
    },
  });
  const { session, subscription, store } = createHost(server, async () => {
    order.push("snapshot");
    return history;
  });
  await session.synchronize("c");
  const prepared = server.slots.get("c");
  if (!prepared) throw new Error("Missing prepared subscription");
  order.length = 0;
  const notice: DeliveryNotice = {
    version: 1,
    kind: "delivery-notice",
    subscriptionId: prepared.subscriptionId,
    streamId: prepared.baseline.streamId,
    epoch: prepared.baseline.epoch,
    code: RealtimeErrorCode.ResyncRequired,
  };
  const first = subscription.delivery.notice(notice, () => true);
  const second = subscription.delivery.notice(notice, () => true);
  expect(first?.receipt).toEqual(notice);
  expect(second?.receipt).toEqual(notice);
  expect(get(store.view).histories.get("c")?.deliveryIssue).toBe(
    RealtimeErrorCode.ResyncRequired,
  );
  expect(order).toEqual([]);
  expect(second?.afterReply).toBeUndefined();
  first?.afterReply?.();
  await entered.promise;
  expect(order).toEqual(["conversations.unsubscribe"]);
  release.resolve();
  await activated.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(order).toEqual([
    "conversations.unsubscribe",
    "conversations.subscribe",
    "snapshot",
    "conversations.activate",
  ]);
  expect(get(store.view).histories.get("c")?.deliveryIssue).toBeUndefined();
  expect(subscription.delivery.notice(notice, () => true)).toBeNull();
  await subscription.dispose();
});

test("canonical refresh on a retained subscription pauses business apply until snapshot activation", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let reads = 0;
  const server = createSubscriptionServer();
  const { session, subscription, store } = createHost(server, async () => {
    if (++reads === 2) {
      entered.resolve();
      await release.promise;
    }
    return history;
  });
  await session.synchronize("c");
  const prepared = server.slots.get("c");
  if (!prepared) throw new Error("Missing prepared subscription");
  const pending = session.synchronize("c");
  await entered.promise;
  const unit = {
    kind: "single",
    event: {
      version: 1,
      kind: "event",
      type: "messages.created",
      eventId: crypto.randomUUID(),
      occurredAt: "2026-10-20T00:00:00Z",
      meta: { requestId: crypto.randomUUID() },
      data: {
        message: {
          id: "m1",
          conversationId: "c",
          authorId: "peer",
          text: "late",
          sequence: 1,
          createdAt: "2026-10-20T00:00:00Z",
        },
      },
      delivery: {
        subscriptionId: prepared.subscriptionId,
        ...prepared.baseline,
        cursor: 1,
      },
    },
  } as const;
  try {
    expect(
      (await subscription.delivery.receive(unit, () => true))?.reply.kind,
    ).toBe("retry-later");
  } finally {
    release.resolve();
    await pending;
  }
  expect(
    (await subscription.delivery.receive(unit, () => true))?.reply.kind,
  ).toBe("applied");
  expect(
    get(store.view)
      .histories.get("c")
      ?.items.map((message) => message.id),
  ).toEqual(["m1"]);
  await subscription.dispose();
});

test.each(["lost", "held"])(
  "eviction owns a %s prepare ACK reservation before another target admission",
  async (mode) => {
    const prepared = Promise.withResolvers<void>();
    const prepareAck = Promise.withResolvers<void>();
    const cleanupAck = Promise.withResolvers<void>();
    let closing = false;
    const server = createSubscriptionServer({
      after: async (command) => {
        if (
          command.type === "conversations.subscribe" &&
          command.data.conversationId === "c0"
        ) {
          prepared.resolve();
          if (mode === "lost") throw new Error("lost prepare ACK");
          await prepareAck.promise;
        }
      },
      before: async (command) => {
        if (
          command.type === "conversations.unsubscribe" &&
          command.data.conversationId === "c0"
        ) {
          closing = true;
          await cleanupAck.promise;
        }
      },
    });
    await server.command({
      version: 1,
      kind: "command",
      type: "conversations.unread.subscribe",
      data: {},
      meta: { requestId: crypto.randomUUID() },
    });
    const { store, session, subscription } = createHost(server);
    const first = session.synchronize("c0");
    await prepared.promise;
    if (mode === "lost") expect((await first).kind).toBe("failed");
    const pending = Array.from({ length: 5 }, (_, index) =>
      session.synchronize(`c${index + 1}`),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    prepareAck.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(get(store.view).histories.has("c0")).toBe(false);
      expect(closing).toBe(true);
      const newPrepares = server.commands.filter(
        (command) =>
          command.type === "conversations.subscribe" &&
          command.data.conversationId !== "c0",
      );
      expect(newPrepares).toHaveLength(0);
      cleanupAck.resolve();
      expect(
        (await Promise.all(pending)).every(
          (result) => result.kind === "applied",
        ),
      ).toBe(true);
      expect(server.slots.has("c0")).toBe(false);
      expect(server.maxSlots()).toBeLessThanOrEqual(6);
      expect(get(store.view).histories.size).toBe(5);
    } finally {
      prepareAck.resolve();
      cleanupAck.resolve();
      await first;
      await Promise.all(pending);
      await subscription.dispose();
    }
  },
);

test("interrupted resync reconnect completes the new owner and cannot retain an invisible retry-later issue", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let hold = true;
  const server = createSubscriptionServer({
    before: async (command) => {
      if (hold && command.type === "conversations.unsubscribe") {
        entered.resolve();
        await release.promise;
      }
    },
  });
  const { store, session, subscription } = createHost(server);
  await session.synchronize("c");
  const old = server.slots.get("c");
  if (!old) throw new Error("missing subscription");
  const notice: DeliveryNotice = {
    version: 1,
    kind: "delivery-notice",
    subscriptionId: old.subscriptionId,
    streamId: old.baseline.streamId,
    epoch: old.baseline.epoch,
    code: RealtimeErrorCode.ResyncRequired,
  };
  subscription.delivery.notice(notice, () => true)?.afterReply?.();
  await entered.promise;
  subscription.onGenerationLost();
  server.slots.clear();
  hold = false;
  release.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect((await session.synchronize("c")).kind).toBe("applied");
  const current = server.slots.get("c");
  if (!current) throw new Error("missing new subscription");
  expect(current.subscriptionId).not.toBe(old.subscriptionId);
  expect(get(store.view).histories.get("c")?.deliveryIssue).toBeUndefined();
  expect(subscription.delivery.notice(notice, () => true)).toBeNull();
  const event: Extract<DeliveryUnit, { kind: "single" }>["event"] = {
    version: 1,
    kind: "event",
    type: "messages.receipts.updated",
    eventId: crypto.randomUUID(),
    occurredAt: "2026-10-20T00:00:00Z",
    meta: { requestId: crypto.randomUUID() },
    delivery: {
      subscriptionId: current.subscriptionId,
      ...current.baseline,
      cursor: 1,
    },
    data: { conversationId: "c", receipts: [] },
  };
  expect(
    (await subscription.delivery.receive({ kind: "single", event }, () => true))
      ?.reply.kind,
  ).toBe("applied");
  await subscription.dispose();
});
