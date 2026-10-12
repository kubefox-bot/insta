import { expect, test } from "bun:test";
import { persistedRecordSchema } from "../../src/domains/conversations/browser/outbox/adapters/lib/indexed-db/record";
import { enqueue } from "../../src/domains/conversations/browser/outbox/use-cases/enqueue";
import { memoryQueue, readRecords } from "../fixtures/outbox/memory";

const record = {
  ownerId: "alice",
  conversationId: "a".repeat(24),
  text: "retained draft",
  key: "operation-key",
  clientMessageId: "client-id",
  operationId: "operation-id",
  createdAt: 0,
  attempts: 0,
  nextAttemptAt: 0,
  lastAuthGeneration: "login-generation",
  revision: 0,
  manualAttempt: false,
  state: "queued",
  needsConfirmation: false,
} as const;

test.each(["short-wire-id", "A".repeat(24), "a".repeat(23), "g".repeat(24)])(
  "durable queue rejects noncanonical conversation ID %s before saving",
  async (conversationId) => {
    const queue = memoryQueue();
    const result = await enqueue(
      {
        ownerId: record.ownerId,
        conversationId,
        text: record.text,
        authGeneration: record.lastAuthGeneration,
      },
      { queue, clock: () => 0, uuid: () => crypto.randomUUID() },
    );
    expect(String(result.isError() && result.getError())).toBe(
      "INVALID_MESSAGE",
    );
    expect(await readRecords(queue, record.ownerId)).toEqual([]);
    expect(
      persistedRecordSchema.safeParse({ ...record, conversationId }).success,
    ).toBe(false);
  },
);

test("canonical conversation ID remains valid for durable enqueue and record recovery", async () => {
  const queue = memoryQueue();
  const result = await enqueue(
    {
      ownerId: record.ownerId,
      conversationId: record.conversationId,
      text: record.text,
      authGeneration: record.lastAuthGeneration,
    },
    { queue, clock: () => 0, uuid: () => crypto.randomUUID() },
  );
  expect(result.isOk()).toBe(true);
  expect(await readRecords(queue, record.ownerId)).toHaveLength(1);
  expect(persistedRecordSchema.safeParse(record).success).toBe(true);
});
