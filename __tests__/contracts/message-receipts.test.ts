import { expect, test } from "bun:test";
import {
  messageSchema,
  receiptBatchSchema,
  receiptBatchSnapshotSchema,
  receiptSnapshotSchema,
  receiptStateSchema,
  receiptStatusSchema,
} from "@insta/contracts/messages";
import { eventSchema } from "@insta/contracts/realtime";

const receipt = {
  messageId: "msg_one",
  recipientId: "usr_recipient",
  sequence: 1,
  deliveredAt: "2026-10-11T12:00:00.000Z",
  readAt: "2026-10-11T12:01:00.000Z",
};
const message = {
  id: receipt.messageId,
  conversationId: "conv_one",
  authorId: "usr_sender",
  text: "Привет",
  sequence: 1,
  createdAt: "2026-10-11T11:59:00.000Z",
};
const snapshot = {
  conversationId: message.conversationId,
  receipts: [receipt],
};
const event = {
  delivery: {
    streamId: "conversation:conv_123",
    epoch: "30a166db-489c-41cb-b701-848ec0446414",
    cursor: 1,
    subscriptionId: "f6809456-c976-43fc-844a-6a4fa4d57e7d",
  },
  version: 1,
  kind: "event",
  type: "messages.receipts.updated",
  eventId: "913ee159-cc23-4e7c-a9c4-fb72dd565a64",
  occurredAt: receipt.readAt,
  meta: { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" },
  data: snapshot,
};

test("receipt input accepts exactly one known status and 1 through 50 IDs", () => {
  for (const status of ["delivered", "read"]) {
    expect(receiptStatusSchema.safeParse(status).success).toBe(true);
    expect(
      receiptBatchSchema.safeParse({ messageIds: ["one"], status }).success,
    ).toBe(true);
    expect(
      receiptBatchSchema.safeParse({
        messageIds: Array.from({ length: 50 }, (_, index) => `msg_${index}`),
        status,
      }).success,
    ).toBe(true);
  }
  for (const messageIds of [
    [],
    [""],
    ["x".repeat(129)],
    Array.from({ length: 51 }, (_, index) => `msg_${index}`),
  ]) {
    expect(
      receiptBatchSchema.safeParse({ messageIds, status: "read" }).success,
    ).toBe(false);
  }
});

test("receipt input rejects invented status, client recipient and timestamps", () => {
  const input = { messageIds: ["one"], status: "read" };
  for (const change of [
    { status: "sent" },
    { status: "unknown" },
    { recipientId: "forged" },
    { deliveredAt: receipt.deliveredAt },
    { readAt: receipt.readAt },
    { nowMs: 1 },
    { conversationId: "another" },
  ]) {
    expect(receiptBatchSchema.safeParse({ ...input, ...change }).success).toBe(
      false,
    );
  }
});

test("canonical receipt snapshot accepts ISO or null timestamps and requires identity", () => {
  expect(receiptSnapshotSchema.parse(receipt)).toEqual(receipt);
  expect(receiptBatchSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  expect(
    receiptSnapshotSchema.safeParse({
      ...receipt,
      deliveredAt: null,
      readAt: null,
    }).success,
  ).toBe(true);
  for (const change of [
    { messageId: "" },
    { recipientId: "" },
    { sequence: 0 },
    { sequence: 1.5 },
    { deliveredAt: 1 },
    { readAt: "invalid" },
    { unexpected: true },
  ]) {
    expect(
      receiptSnapshotSchema.safeParse({ ...receipt, ...change }).success,
    ).toBe(false);
  }
});

test("message receipts are optional and nullable empty fields retain sent state", () => {
  expect(messageSchema.parse(message)).toEqual(message);
  const sent = { deliveredAt: null, readAt: null };
  expect(receiptStateSchema.parse(sent)).toEqual(sent);
  expect(messageSchema.parse({ ...message, receipt: sent }).receipt).toEqual(
    sent,
  );
  expect(
    messageSchema.parse({
      ...message,
      receipt: { deliveredAt: receipt.deliveredAt, readAt: receipt.readAt },
    }).receipt,
  ).toEqual({ deliveredAt: receipt.deliveredAt, readAt: receipt.readAt });
  expect(
    messageSchema.safeParse({
      ...message,
      receipt: { ...sent, recipientId: "leaked" },
    }).success,
  ).toBe(false);
});

test("receipt realtime event uses the canonical batch snapshot and closed union", () => {
  expect(eventSchema.parse(event).data).toEqual(snapshot);
  expect(
    eventSchema.safeParse({ ...event, type: "messages.receipts.unknown" })
      .success,
  ).toBe(false);
  expect(
    eventSchema.safeParse({ ...event, data: { ...snapshot, status: "read" } })
      .success,
  ).toBe(false);
  expect(
    eventSchema.safeParse({
      ...event,
      type: "messages.created",
      data: { message },
    }).success,
  ).toBe(true);
});
