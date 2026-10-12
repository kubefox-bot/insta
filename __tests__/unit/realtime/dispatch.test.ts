import { expect, test } from "bun:test";

test("realtime dispatcher accepts unread invalidation and rejects unknown pushes without handlers", async () => {
  const path = "../../../apps/fe-insta/src/lib/realtime/dispatch-event.ts";
  expect(await Bun.file(new URL(path, import.meta.url)).exists()).toBe(true);
  const { dispatchEvent } = await import(path);
  const observed: unknown[] = [];
  const handled: unknown[] = [];
  const event = {
    version: 1,
    kind: "event",
    type: "conversations.unread.changed",
    delivery: {
      subscriptionId: crypto.randomUUID(),
      streamId: "stream",
      epoch: crypto.randomUUID(),
      cursor: 1,
    },
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    meta: { requestId: crypto.randomUUID() },
    data: { conversationId: "012345678901234567890123" },
  };
  const handlers = {
    "messages.created": () => "stale" as const,
    "messages.receipts.updated": () => "stale" as const,
    "conversations.unread.changed": (value: unknown) => {
      handled.push(value);
      return "applied" as const;
    },
  };
  expect(
    await dispatchEvent({
      payload: event,
      handlers,
      observe: (value: unknown) => {
        observed.push(value);
      },
    }),
  ).toBe("applied");
  expect(
    await dispatchEvent({
      payload: { ...event, type: "unknown" },
      handlers,
      observe: (value: unknown) => {
        observed.push(value);
      },
    }),
  ).toBe("invalid");
  expect(handled).toHaveLength(1);
  expect(observed).toHaveLength(2);
});

test("realtime dispatcher validates and dispatches canonical receipt batches", async () => {
  const { dispatchEvent } = await import(
    "../../../apps/fe-insta/src/lib/realtime/dispatch-event"
  );
  const snapshots: unknown[] = [];
  const event = {
    version: 1,
    kind: "event",
    type: "messages.receipts.updated",
    delivery: {
      subscriptionId: crypto.randomUUID(),
      streamId: "stream",
      epoch: crypto.randomUUID(),
      cursor: 1,
    },
    eventId: "913ee159-cc23-4e7c-a9c4-fb72dd565a64",
    occurredAt: "2026-10-11T12:00:00.000Z",
    meta: { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" },
    data: {
      conversationId: "conv_one",
      receipts: [
        {
          messageId: "msg_one",
          recipientId: "usr_recipient",
          sequence: 1,
          deliveredAt: "2026-10-11T12:00:00.000Z",
          readAt: null,
        },
      ],
    },
  };
  const handlers = {
    "messages.created": () => "stale" as const,
    "conversations.unread.changed": () => "stale" as const,
    "messages.receipts.updated": (value: { data: unknown }) => {
      snapshots.push(value.data);
      return "applied" as const;
    },
  };
  expect(
    await dispatchEvent({ payload: event, handlers, observe: () => {} }),
  ).toBe("applied");
  expect(snapshots).toEqual([event.data]);
  expect(
    await dispatchEvent({
      payload: { ...event, data: { ...event.data, receipts: [{ readAt: 1 }] } },
      handlers,
      observe: () => {},
    }),
  ).toBe("invalid");
  expect(snapshots).toHaveLength(1);
});

test("unread invalidation dispatches without message content or client-derived counters", async () => {
  const { dispatchEvent } = await import(
    "../../../apps/fe-insta/src/lib/realtime/dispatch-event"
  );
  const received: string[] = [];
  const payload = {
    version: 1,
    kind: "event",
    type: "conversations.unread.changed",
    delivery: {
      subscriptionId: crypto.randomUUID(),
      streamId: "stream",
      epoch: crypto.randomUUID(),
      cursor: 1,
    },
    eventId: crypto.randomUUID(),
    occurredAt: "2026-10-12T00:00:00.000Z",
    meta: { requestId: crypto.randomUUID() },
    data: { conversationId: "conv_unread" },
  };
  const handlers = {
    "messages.created": () => "stale" as const,
    "messages.receipts.updated": () => "stale" as const,
    "conversations.unread.changed": (event: {
      data: { conversationId: string };
    }) => {
      received.push(event.data.conversationId);
      return "applied" as const;
    },
  };
  expect(await dispatchEvent({ payload, handlers, observe: () => {} })).toBe(
    "applied",
  );
  expect(received).toEqual(["conv_unread"]);
  expect(
    await dispatchEvent({
      payload: { ...payload, data: { ...payload.data, count: 1 } },
      handlers,
      observe: () => {},
    }),
  ).toBe("invalid");
  expect(received).toHaveLength(1);
});
