import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { mountReceiptAcknowledgments } from "../../src/domains/conversations/browser/receipts/lifecycle";
import type { AcknowledgeReceiptsInput } from "../../src/domains/conversations/browser/receipts/types";
import { createConversationStore } from "../../src/domains/conversations/browser/store";
import { createClock } from "./fixtures/clock";

const actor = { userId: "alice", generation: "g1" };
const message = {
  id: "m",
  conversationId: "c",
  authorId: "bob",
  text: "hello",
  sequence: 1,
  createdAt: "2026-10-11T10:00:00.000Z",
};
const history = {
  items: [message],
  baselineCursor: 0,
  watermark: 1,
  pageInfo: { nextCursor: null, hasMore: false },
};
test("only selected loaded store messages enroll; close aborts and fences late successful response", async () => {
  const time = createClock();
  const store = createConversationStore({ actor, initial: [] });
  const calls: AcknowledgeReceiptsInput[] = [];
  let complete:
    | ((snapshot: {
        conversationId: string;
        receipts: {
          messageId: string;
          recipientId: string;
          sequence: number;
          deliveredAt: string;
          readAt: null;
        }[];
      }) => void)
    | undefined;
  const runtime = mountReceiptAcknowledgments({
    actor,
    store,
    currentActor: () => get(store.view).actor,
    clock: time.clock,
    acknowledge: async (input) => {
      calls.push(input);
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  store.receive(message, actor);
  runtime.readVisible(["m"]);
  await time.advance(200);
  expect(calls).toHaveLength(0);
  store.hydrate({ actor, conversationId: "c", history });
  await time.advance(200);
  expect(calls).toHaveLength(0);
  store.select("c");
  await time.advance(200);
  expect(calls).toHaveLength(1);
  store.select("other");
  expect(calls[0]?.signal.aborted).toBe(true);
  complete?.({
    conversationId: "c",
    receipts: [
      {
        messageId: "m",
        recipientId: "alice",
        sequence: 1,
        deliveredAt: "2026-10-11T10:00:01.000Z",
        readAt: null,
      },
    ],
  });
  await time.advance(200);
  expect(get(store.view).histories.get("c")?.items[0]?.receipt).toBeUndefined();
  runtime.dispose();
  expect(time.count()).toBe(0);
});
test("store response reentrancy drains remaining accepted batches without losing a read upgrade", async () => {
  const time = createClock();
  const store = createConversationStore({ actor, initial: [] });
  const calls: AcknowledgeReceiptsInput[] = [];
  const runtime = mountReceiptAcknowledgments({
    actor,
    store,
    currentActor: () => actor,
    clock: time.clock,
    acknowledge: async (input) => {
      calls.push(input);
      return {
        conversationId: "c",
        receipts: input.messageIds.map((messageId) => ({
          messageId,
          recipientId: "alice",
          sequence: Number(messageId.slice(1)) + 1,
          deliveredAt: "2026-10-11T10:00:01.000Z",
          readAt: null,
        })),
      };
    },
  });
  store.select("c");
  store.hydrate({
    actor,
    conversationId: "c",
    history: {
      ...history,
      items: Array.from({ length: 51 }, (_, index) => ({
        ...message,
        id: `m${index}`,
        sequence: index + 1,
      })),
      watermark: 51,
    },
  });
  await time.advance(200);
  expect(calls.map((call) => call.messageIds.length)).toEqual([50, 1]);
  runtime.dispose();
});
test("late old actor receipt response is fenced even before conversation state reconciliation", async () => {
  const time = createClock();
  const store = createConversationStore({ actor, initial: [] });
  let current = actor;
  const response = Promise.withResolvers<{
    conversationId: string;
    receipts: {
      messageId: string;
      recipientId: string;
      sequence: number;
      deliveredAt: string;
      readAt: null;
    }[];
  }>();
  const runtime = mountReceiptAcknowledgments({
    actor,
    store,
    currentActor: () => current,
    clock: time.clock,
    acknowledge: async () => response.promise,
  });
  store.select("c");
  store.hydrate({ actor, conversationId: "c", history });
  await time.advance(200);
  current = { ...actor, generation: "g2" };
  response.resolve({
    conversationId: "c",
    receipts: [
      {
        messageId: "m",
        recipientId: "alice",
        sequence: 1,
        deliveredAt: "2026-10-11T10:00:01.000Z",
        readAt: null,
      },
    ],
  });
  await time.advance(200);
  expect(get(store.view).histories.get("c")?.items[0]?.receipt).toBeUndefined();
  runtime.dispose();
});
test("successful acknowledgment updates canonical projection; same-user generation clears receipts lifecycle", async () => {
  const time = createClock();
  const store = createConversationStore({ actor, initial: [] });
  const calls: AcknowledgeReceiptsInput[] = [];
  const runtime = mountReceiptAcknowledgments({
    actor,
    store,
    currentActor: () => get(store.view).actor,
    clock: time.clock,
    acknowledge: async (input) => {
      calls.push(input);
      return {
        conversationId: "c",
        receipts: [
          {
            messageId: "m",
            recipientId: "alice",
            sequence: 1,
            deliveredAt: "2026-10-11T10:00:01.000Z",
            readAt: input.status === "read" ? "2026-10-11T10:00:02.000Z" : null,
          },
        ],
      };
    },
  });
  store.select("c");
  store.hydrate({ actor, conversationId: "c", history });
  runtime.readVisible(["m"]);
  await time.advance(200);
  expect(get(store.view).histories.get("c")?.items[0]?.receipt?.readAt).toBe(
    "2026-10-11T10:00:02.000Z",
  );
  store.hydrate({ actor, conversationId: "c", history });
  await time.advance(200);
  expect(calls).toHaveLength(1);
  store.reconcileActor({ ...actor, generation: "g2" });
  store.select("c");
  store.hydrate({
    actor: { ...actor, generation: "g2" },
    conversationId: "c",
    history,
  });
  await time.advance(200);
  expect(calls).toHaveLength(1);
  runtime.dispose();
});

test("unread refresh notification follows persisted owned read ack, never open or delivered ack", async () => {
  const time = createClock();
  const store = createConversationStore({ actor, initial: [] });
  const read =
    Promise.withResolvers<
      import("../../src/domains/conversations/browser/receipts/types").ReceiptBatchWireSnapshot
    >();
  let confirmed = 0;
  const runtime = mountReceiptAcknowledgments({
    actor,
    store,
    currentActor: () => actor,
    clock: time.clock,
    onReadAcknowledged: () => {
      confirmed += 1;
    },
    acknowledge: async (input) =>
      input.status === "read"
        ? read.promise
        : {
            conversationId: "c",
            receipts: [
              {
                messageId: "m",
                recipientId: "alice",
                sequence: 1,
                deliveredAt: "2026-10-11T10:00:01.000Z",
                readAt: null,
              },
            ],
          },
  });
  store.select("c");
  store.hydrate({ actor, conversationId: "c", history });
  await time.advance(200);
  expect(confirmed).toBe(0);
  runtime.readVisible(["m"]);
  await time.advance(200);
  expect(confirmed).toBe(0);
  read.resolve({
    conversationId: "c",
    receipts: [
      {
        messageId: "m",
        recipientId: "alice",
        sequence: 1,
        deliveredAt: "2026-10-11T10:00:01.000Z",
        readAt: "2026-10-11T10:00:02.000Z",
      },
    ],
  });
  await time.advance(200);
  expect(confirmed).toBe(1);
  runtime.readVisible(["m"]);
  await time.advance(200);
  expect(confirmed).toBe(1);
  runtime.dispose();
  expect(time.count()).toBe(0);
});
