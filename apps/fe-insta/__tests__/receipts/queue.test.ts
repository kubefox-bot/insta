import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { ReceiptRequestError } from "../../src/domains/conversations/browser/receipts/error";
import { createReceiptQueue } from "../../src/domains/conversations/browser/receipts/queue";
import type { AcknowledgeReceiptsInput } from "../../src/domains/conversations/browser/receipts/types";
import type { Message } from "../../src/domains/conversations/browser/types";
import { createClock } from "./fixtures/clock";

const actor = { userId: "alice", generation: "g1" };
const message = (id: string, authorId = "bob"): Message => ({
  id,
  authorId,
  conversationId: "c",
  sequence: 1,
  text: "hello",
  createdAt: "2026-10-11T10:00:00.000Z",
});
const snapshot = (input: AcknowledgeReceiptsInput) => ({
  conversationId: input.conversationId,
  receipts: input.messageIds.map((messageId) => ({
    messageId,
    recipientId: "alice",
    sequence: 1,
    deliveredAt: "2026-10-11T10:00:01.000Z",
    readAt: input.status === "read" ? "2026-10-11T10:00:02.000Z" : null,
  })),
});
test("coalesces accepted incoming IDs, splits 50 and skips own/confirmed duplicates", async () => {
  const time = createClock();
  const calls: AcknowledgeReceiptsInput[] = [];
  const queue = createReceiptQueue({
    actor,
    currentActor: () => actor,
    clock: time.clock,
    acknowledge: async (input) => {
      calls.push(input);
      return snapshot(input);
    },
  });
  const items = Array.from({ length: 51 }, (_, i) => message(`m${i}`));
  queue.acceptMessages([...items, message("own", "alice")]);
  queue.acceptMessages(items);
  await time.advance(199);
  expect(calls).toHaveLength(0);
  await time.advance(1);
  expect(calls.map((call) => call.messageIds.length)).toEqual([50, 1]);
  queue.acceptMessages(items);
  await time.advance(200);
  expect(calls).toHaveLength(2);
  queue.dispose();
  expect(time.count()).toBe(0);
});
test("persisted confirmation learned while retry pending cancels request rather than retrying forever", async () => {
  const time = createClock();
  let calls = 0;
  const queue = createReceiptQueue({
    actor,
    currentActor: () => actor,
    clock: time.clock,
    acknowledge: async () => {
      calls++;
      throw new Error("network outcome unknown");
    },
  });
  queue.acceptMessages([message("a")]);
  await time.advance(200);
  queue.acceptMessages([
    {
      ...message("a"),
      receipt: {
        deliveredAt: "2026-10-11T10:00:01.000Z",
        readAt: "2026-10-11T10:00:02.000Z",
      },
    },
  ]);
  queue.readVisible(["a"]);
  await time.advance(60000);
  expect(calls).toBe(1);
  expect(get(queue.view).errors).toEqual([]);
  queue.dispose();
});
test("read replaces pending delivered and survives an in-flight delivered success", async () => {
  const time = createClock();
  const calls: AcknowledgeReceiptsInput[] = [];
  let complete: (() => void) | undefined;
  const queue = createReceiptQueue({
    actor,
    currentActor: () => actor,
    clock: time.clock,
    acknowledge: async (input) => {
      calls.push(input);
      if (calls.length === 1)
        await new Promise<void>((resolve) => {
          complete = resolve;
        });
      return snapshot(input);
    },
  });
  queue.acceptMessages([message("a"), message("b")]);
  queue.readVisible(["a", "unknown"]);
  await time.advance(200);
  expect(calls[0]?.status).toBe("read");
  expect(calls[0]?.messageIds).toEqual(["a"]);
  queue.readVisible(["b"]);
  complete?.();
  await time.advance(200);
  expect(calls.map((call) => [call.status, call.messageIds])).toEqual([
    ["read", ["a"]],
    ["read", ["b"]],
  ]);
  queue.dispose();
});
test("read upgrade survives delivered request already in flight", async () => {
  const time = createClock();
  const calls: AcknowledgeReceiptsInput[] = [];
  let complete: (() => void) | undefined;
  const queue = createReceiptQueue({
    actor,
    currentActor: () => actor,
    clock: time.clock,
    acknowledge: async (input) => {
      calls.push(input);
      if (calls.length === 1)
        await new Promise<void>((resolve) => {
          complete = resolve;
        });
      return snapshot(input);
    },
  });
  queue.acceptMessages([message("a")]);
  await time.advance(200);
  queue.readVisible(["a"]);
  complete?.();
  await time.advance(200);
  expect(calls.map((call) => call.status)).toEqual(["delivered", "read"]);
  queue.dispose();
});
test("unknown outcomes retry original IDs with capped backoff and Retry-After; errors remain distinct", async () => {
  const time = createClock();
  const times: number[] = [];
  const calls: AcknowledgeReceiptsInput[] = [];
  const queue = createReceiptQueue({
    actor,
    currentActor: () => actor,
    clock: time.clock,
    acknowledge: async (input) => {
      times.push(time.clock.now());
      calls.push(input);
      throw new ReceiptRequestError(
        "RECEIPT_OUTCOME_UNKNOWN",
        503,
        calls.length === 1 ? "3" : undefined,
      );
    },
  });
  queue.acceptMessages([message("a")]);
  await time.advance(200);
  expect(get(queue.view).errors[0]?.kind).toBe("retry");
  await time.advance(2999);
  expect(calls).toHaveLength(1);
  await time.advance(1);
  await time.advance(2000 + 4000 + 8000 + 16000 + 16000);
  expect(times).toEqual([200, 3200, 5200, 9200, 17200, 33200, 49200]);
  expect(calls.every((call) => call.messageIds.join() === "a")).toBe(true);
  queue.dispose();
  expect(time.count()).toBe(0);
});
test("terminal request stops automatically and manual retry; read already confirmed creates no requests", async () => {
  const time = createClock();
  const calls: AcknowledgeReceiptsInput[] = [];
  const queue = createReceiptQueue({
    actor,
    currentActor: () => actor,
    clock: time.clock,
    acknowledge: async (input) => {
      calls.push(input);
      throw new ReceiptRequestError("FORBIDDEN", 403);
    },
  });
  queue.acceptMessages([
    message("a"),
    {
      ...message("read"),
      receipt: {
        deliveredAt: "2026-10-11T10:00:01.000Z",
        readAt: "2026-10-11T10:00:02.000Z",
      },
    },
  ]);
  queue.readVisible(["read"]);
  await time.advance(200);
  queue.retry();
  queue.acceptMessages([message("a")]);
  await time.advance(60000);
  expect(calls).toHaveLength(1);
  expect(get(queue.view).errors[0]?.kind).toBe("terminal");
  queue.dispose();
});
test("HTTP-date and long delta Retry-After remain lower bounds; malformed header falls back to exponential retry", async () => {
  for (const { header, duration, want } of [
    { header: "60", duration: 60000, want: [200, 60200] },
    {
      header: "Thu, 01 Jan 1970 00:01:00 GMT",
      duration: 60000,
      want: [200, 60000],
    },
    { header: "nonsense", duration: 1000, want: [200, 1200] },
  ]) {
    const time = createClock();
    const times: number[] = [];
    const queue = createReceiptQueue({
      actor,
      currentActor: () => actor,
      clock: time.clock,
      acknowledge: async () => {
        times.push(time.clock.now());
        throw new ReceiptRequestError("RATE_LIMITED", 429, header);
      },
    });
    queue.acceptMessages([message("a")]);
    await time.advance(200);
    queue.retry();
    await time.advance(duration);
    expect(times.slice(0, 2)).toEqual(want);
    queue.dispose();
  }
});
