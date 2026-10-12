import { expect, test } from "bun:test";
import { commonErrorSchema, envelopeSchema } from "@insta/contracts/http";
import { messageSchema } from "@insta/contracts/messages";
import {
  ackSchema,
  commandSchema,
  deliveryAckSchema,
  deliveryPositionSchema,
  deliveryReplySchema,
  deliveryUnitSchema,
  eventSchema,
  replayPayloadSchema,
} from "@insta/contracts/realtime";
import { z } from "zod";

const meta = {
  requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9",
  operationId: "8d96fdc6-021a-4b44-bb44-123b4df7f53a",
};
const message = {
  id: "msg_123",
  conversationId: "conv_123",
  authorId: "usr_123",
  sequence: 1,
  text: "Привет",
  createdAt: "2026-10-07T12:00:00.000Z",
};
const validPosition = {
  streamId: "conversation:conv_123",
  epoch: "30a166db-489c-41cb-b701-848ec0446414",
  cursor: 1,
};
const delivery = {
  ...validPosition,
  subscriptionId: "f6809456-c976-43fc-844a-6a4fa4d57e7d",
};
const unreadEvent = (cursor: number) => ({
  ...event,
  type: "conversations.unread.changed",
  data: { conversationId: "conv_123" },
  delivery: { ...delivery, cursor },
});
const event = {
  delivery,
  version: 1,
  kind: "event",
  type: "messages.created",
  eventId: "913ee159-cc23-4e7c-a9c4-fb72dd565a64",
  occurredAt: message.createdAt,
  data: { message },
  meta,
};
test("same Message crosses HTTP and realtime; unknown or leaked push fields are rejected", () => {
  expect(
    envelopeSchema(
      z.strictObject({ message: messageSchema }),
      commonErrorSchema,
    ).safeParse({ ok: true, data: { message }, meta }).success,
  ).toBe(true);
  expect(eventSchema.safeParse(event).success).toBe(true);
  for (const changed of [
    { ...event, version: 2 },
    { ...event, type: "unknown" },
    { ...event, meta: { ...meta, idempotencyKey: meta.operationId } },
    { ...event, data: { message: { ...message, sequence: 0 } } },
  ])
    expect(eventSchema.safeParse(changed).success).toBe(false);
});
test("readonly commands and ACK require matching-capable correlation and allowed conversation", () => {
  for (const type of ["conversations.subscribe", "conversations.unsubscribe"])
    expect(
      commandSchema.safeParse({
        version: 1,
        kind: "command",
        type,
        data: { conversationId: "conv_123" },
        meta,
      }).success,
    ).toBe(true);
  expect(
    commandSchema.safeParse({
      version: 1,
      kind: "command",
      type: "messages.send",
      data: { message },
      meta,
    }).success,
  ).toBe(false);
  expect(
    ackSchema.safeParse({
      version: 1,
      kind: "ack",
      ok: true,
      data: { conversationId: "conv_123" },
      meta,
    }).success,
  ).toBe(true);
  expect(
    ackSchema.safeParse({ version: 1, kind: "ack", ok: true, data: {}, meta })
      .success,
  ).toBe(false);
});
test("retired notification events are rejected at the wire boundary", () => {
  expect(
    eventSchema.safeParse({
      ...event,
      type: "notifications.created",
      data: {
        notificationId: event.eventId,
        kind: "system.info",
        messageKey: "notifications.systemInfo",
        parameters: {},
        target: {
          kind: "conversation",
          conversationId: event.data.message.conversationId,
        },
      },
    }).success,
  ).toBe(false);
});

test("account unread subscription and invalidation have closed versioned contracts", () => {
  for (const type of [
    "conversations.unread.subscribe",
    "conversations.unread.unsubscribe",
  ]) {
    const command = { version: 1, kind: "command", type, data: {}, meta };
    expect(commandSchema.safeParse(command).success).toBe(true);
    for (const data of [
      { actorId: "usr_other" },
      { conversationId: "conv_123" },
    ])
      expect(commandSchema.safeParse({ ...command, data }).success).toBe(false);
  }
  for (const subscribed of [true, false])
    expect(
      ackSchema.safeParse({
        version: 1,
        kind: "ack",
        ok: true,
        data: { subscription: "unread", subscribed },
        meta,
      }).success,
    ).toBe(subscribed === false);
  expect(
    ackSchema.safeParse({
      version: 1,
      kind: "ack",
      ok: true,
      data: {
        subscription: "unread",
        subscribed: true,
        conversationId: "conv_123",
      },
      meta,
    }).success,
  ).toBe(false);
  const invalidation = {
    ...event,
    type: "conversations.unread.changed",
    data: { conversationId: "conv_123" },
  };
  expect(eventSchema.safeParse(invalidation).success).toBe(true);
  for (const data of [
    {},
    { conversationId: "" },
    { conversationId: "conv_123", count: 1 },
    { conversationId: "conv_123", message },
  ])
    expect(eventSchema.safeParse({ ...invalidation, data }).success).toBe(
      false,
    );
});

test("delivery positions reject malformed coordinates and unknown fields", () => {
  expect(deliveryPositionSchema.parse(validPosition)).toEqual(validPosition);
  for (const cursor of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN])
    expect(
      deliveryPositionSchema.safeParse({ ...validPosition, cursor }).success,
    ).toBe(false);
  expect(
    deliveryPositionSchema.safeParse({ ...validPosition, cursor: 0 }).success,
  ).toBe(true);
  for (const changed of [
    { ...validPosition, streamId: "" },
    { ...validPosition, epoch: "malformed" },
    { ...validPosition, privatePayload: "secret" },
  ])
    expect(deliveryPositionSchema.safeParse(changed).success).toBe(false);
  expect(deliveryAckSchema.safeParse(delivery).success).toBe(true);
  expect(
    deliveryAckSchema.safeParse({ ...delivery, subscriptionId: "invalid" })
      .success,
  ).toBe(false);
});

test("replay payload excludes subscription delivery while wire events require it", () => {
  const { delivery: _delivery, ...payload } = event;
  expect(replayPayloadSchema.safeParse(payload).success).toBe(true);
  expect(replayPayloadSchema.safeParse(event).success).toBe(false);
  expect(eventSchema.safeParse(payload).success).toBe(false);
  expect(
    eventSchema.safeParse({ ...event, privatePayload: "secret" }).success,
  ).toBe(false);
  expect(
    eventSchema.safeParse({ ...event, delivery: { ...delivery, cursor: -1 } })
      .success,
  ).toBe(false);
  expect(eventSchema.safeParse(unreadEvent(1)).success).toBe(true);
  expect(unreadEvent(1).eventId).toBe(event.eventId);
});

test("delivery replies separate applied, transient and failed outcomes without leaking exceptions", () => {
  for (const kind of ["applied", "retry-later", "apply-failed"])
    expect(
      deliveryReplySchema.safeParse({ kind, position: delivery }).success,
    ).toBe(true);
  for (const retryAfterMs of [0, 1000, Number.MAX_SAFE_INTEGER])
    expect(
      deliveryReplySchema.safeParse({
        kind: "retry-later",
        position: delivery,
        retryAfterMs,
      }).success,
    ).toBe(true);
  for (const retryAfterMs of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1])
    expect(
      deliveryReplySchema.safeParse({
        kind: "retry-later",
        position: delivery,
        retryAfterMs,
      }).success,
    ).toBe(false);
  for (const reply of [
    { kind: "unknown", position: delivery },
    { kind: "apply-failed", position: delivery, message: "private exception" },
    { kind: "applied", position: delivery, retryAfterMs: 0 },
    { kind: "applied", position: validPosition },
  ])
    expect(deliveryReplySchema.safeParse(reply).success).toBe(false);
});

test("unread batches require 1..64 consecutive events in one subscription stream", () => {
  const events = Array.from({ length: 64 }, (_, index) =>
    unreadEvent(index + 1),
  );
  expect(deliveryUnitSchema.safeParse({ kind: "single", event }).success).toBe(
    true,
  );
  expect(
    deliveryUnitSchema.safeParse({ kind: "unread-batch", events }).success,
  ).toBe(true);
  for (const invalid of [
    [],
    [...events, unreadEvent(65)],
    [unreadEvent(1), unreadEvent(3)],
    [unreadEvent(1), unreadEvent(1)],
    [unreadEvent(1), event],
    [
      unreadEvent(1),
      {
        ...unreadEvent(2),
        delivery: { ...delivery, cursor: 2, streamId: "other" },
      },
    ],
    [
      unreadEvent(1),
      {
        ...unreadEvent(2),
        delivery: { ...delivery, cursor: 2, epoch: meta.requestId },
      },
    ],
    [
      unreadEvent(1),
      {
        ...unreadEvent(2),
        delivery: { ...delivery, cursor: 2, subscriptionId: meta.requestId },
      },
    ],
  ])
    expect(
      deliveryUnitSchema.safeParse({ kind: "unread-batch", events: invalid })
        .success,
    ).toBe(false);
});

test("subscribe prepares resumable targets and activation carries the exact prepared token and baseline", () => {
  for (const [type, data] of [
    [
      "conversations.subscribe",
      { conversationId: "conv_123", resume: validPosition },
    ],
    ["conversations.unread.subscribe", { resume: validPosition }],
    [
      "conversations.activate",
      { subscriptionId: delivery.subscriptionId, baseline: validPosition },
    ],
  ])
    expect(
      commandSchema.safeParse({ version: 1, kind: "command", type, data, meta })
        .success,
    ).toBe(true);
  for (const data of [
    { subscriptionId: delivery.subscriptionId },
    { subscriptionId: "invalid", baseline: validPosition },
    {
      subscriptionId: delivery.subscriptionId,
      baseline: validPosition,
      actor: "usr_other",
    },
  ])
    expect(
      commandSchema.safeParse({
        version: 1,
        kind: "command",
        type: "conversations.activate",
        data,
        meta,
      }).success,
    ).toBe(false);
  expect(
    commandSchema.safeParse({
      version: 1,
      kind: "command",
      type: "conversations.unsubscribe",
      data: { conversationId: "conv_123", resume: validPosition },
      meta,
    }).success,
  ).toBe(false);
  for (const data of [
    {
      conversationId: "conv_123",
      subscriptionId: delivery.subscriptionId,
      baseline: validPosition,
    },
    {
      subscription: "unread",
      subscriptionId: delivery.subscriptionId,
      baseline: validPosition,
    },
    { subscriptionId: delivery.subscriptionId, baseline: validPosition },
  ])
    expect(
      ackSchema.safeParse({ version: 1, kind: "ack", ok: true, data, meta })
        .success,
    ).toBe(true);
});

test("control failures accept delivery lifecycle codes and reject unknown codes", () => {
  for (const code of [
    "RESYNC_REQUIRED",
    "PROTOCOL_UNSUPPORTED",
    "DELIVERY_BLOCKED",
  ])
    expect(
      ackSchema.safeParse({
        version: 1,
        kind: "ack",
        ok: false,
        error: { code, message: "Failure" },
        meta,
      }).success,
    ).toBe(true);
  expect(
    ackSchema.safeParse({
      version: 1,
      kind: "ack",
      ok: false,
      error: { code: "UNKNOWN", message: "Failure" },
      meta,
    }).success,
  ).toBe(false);
});
