import { expect, test } from "bun:test";
import { createCommitReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/commit";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

test("receipt commit persists first read as delivered+read and replays unchanged", async () => {
  const f = await createReceiptFixture();
  try {
    const commit = createCommitReceipts(f);
    const input = {
      actorId: f.bob,
      conversationId: f.conversationId,
      messageIds: f.ids.slice(0, 1),
      status: "read" as const,
      nowMs: 500,
    };
    const result = await commit(input);
    expect(result.isOk() ? result.get().receipts : undefined).toEqual([
      {
        messageId: f.ids[0] ?? "",
        recipientId: f.bob,
        sequence: 1,
        deliveredAt: 500,
        readAt: 500,
      },
    ]);
    const replay = await commit({ ...input, status: "delivered", nowMs: 200 });
    expect(replay).toEqual(result);
    expect(
      await f.db.collection("conversations_receipts").countDocuments({}),
    ).toBe(1);
    expect(
      await f.db.collection("conversations_receipt_outbox").countDocuments({}),
    ).toBe(1);
  } finally {
    await f.close();
  }
});

test("pending receipt event survives new adapter and fences an expired lease", async () => {
  const f = await createReceiptFixture();
  try {
    await createCommitReceipts(f)({
      actorId: f.bob,
      conversationId: f.conversationId,
      messageIds: f.ids.slice(0, 1),
      status: "read",
      nowMs: 500,
    });
    const { createMongoReceiptOutbox } = await import(
      "../../../src/domains/conversations/adapters/mongo/receipts/outbox"
    );
    const outbox = createMongoReceiptOutbox(f);
    const first = await outbox.claim({ now: 1000, leaseId: "first" });
    expect(first?.event.receipts[0]?.readAt).toBe(500);
    if (!first) throw new Error("Expected pending receipt event");
    expect(await outbox.claim({ now: 1000, leaseId: "concurrent" })).toBeNull();
    const second = await createMongoReceiptOutbox(f).claim({
      now: 31001,
      leaseId: "second",
    });
    expect(second?.event.eventId).toBe(first.event.eventId);
    if (!second) throw new Error("Expected recovery");
    expect(await outbox.complete({ ...first, now: 31002 })).toBe(false);
    expect(await outbox.fail({ ...first, nextAttemptAt: 31002 })).toBe(false);
    expect(await outbox.complete({ ...second, now: 31002 })).toBe(true);
    expect(await outbox.claim({ now: 70000, leaseId: "third" })).toBeNull();
  } finally {
    await f.close();
  }
});

test("history joins receipts only for listed IDs; unacknowledged historical messages stay sent", async () => {
  const f = await createReceiptFixture();
  try {
    const { createReadHistory } = await import(
      "../../../src/domains/conversations/adapters/mongo/history"
    );
    await createCommitReceipts(f)({
      actorId: f.bob,
      conversationId: f.conversationId,
      messageIds: f.ids.slice(0, 1),
      status: "read",
      nowMs: 500,
    });
    const history = await createReadHistory(f)({
      actorId: f.alice,
      conversationId: f.conversationId,
      range: { direction: "recent" },
      limit: 50,
    });
    if (history.isError()) throw new Error(history.getError());
    expect(
      history.get()?.items.find((item) => item.id === f.ids[0])?.receipt,
    ).toEqual({ deliveredAt: 500, readAt: 500 });
    expect(
      history.get()?.items.find((item) => item.id === f.ids[1])?.receipt,
    ).toBeUndefined();
  } finally {
    await f.close();
  }
});

test("concurrent delivered/read batches are monotonic, unique and do not reorder conversations", async () => {
  const f = await createReceiptFixture();
  try {
    const commit = createCommitReceipts(f);
    const original = await f.db.collection("conversations").findOne({});
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        commit({
          actorId: f.bob,
          conversationId: f.conversationId,
          messageIds: [...f.ids.slice(0, 2), ...f.ids.slice(0, 1)],
          status: index % 2 ? "read" : "delivered",
          nowMs: 500 + index,
        }),
      ),
    );
    expect(results.every((result) => result.isOk())).toBe(true);
    const records = await f.db
      .collection("conversations_receipts")
      .find({})
      .toArray();
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.readAt).toBeGreaterThanOrEqual(record.deliveredAt);
      expect(record.recipientId).toBe(f.bob);
    }
    expect(await f.db.collection("conversations").findOne({})).toEqual(
      original,
    );
    const count = await f.db
      .collection("conversations_receipt_outbox")
      .countDocuments({});
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(2);
    expect(
      (
        await commit({
          actorId: f.bob,
          conversationId: f.conversationId,
          messageIds: f.ids.slice(0, 2).reverse(),
          status: "delivered",
          nowMs: 1,
        })
      ).isOk(),
    ).toBe(true);
    expect(
      await f.db.collection("conversations_receipts").find({}).toArray(),
    ).toEqual(records);
    expect(
      await f.db.collection("conversations_receipt_outbox").countDocuments({}),
    ).toBe(count);
  } finally {
    await f.close();
  }
});

test("transaction abort rolls back receipts and outbox; unknown committed outcome retries without duplicate event", async () => {
  const f = await createReceiptFixture();
  try {
    const input = {
      actorId: f.bob,
      conversationId: f.conversationId,
      messageIds: f.ids.slice(0, 2),
      status: "read" as const,
      nowMs: 500,
    };
    const aborted = createCommitReceipts({
      ...f,
      startSession: () => {
        const session = f.startSession();
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = (callback, options) =>
          transaction(async (current) => {
            await callback(current);
            throw new Error("rollback before commit");
          }, options);
        return session;
      },
    });
    expect((await aborted(input)).isError()).toBe(true);
    expect(
      await f.db.collection("conversations_receipts").countDocuments({}),
    ).toBe(0);
    expect(
      await f.db.collection("conversations_receipt_outbox").countDocuments({}),
    ).toBe(0);
    const lost = createCommitReceipts({
      ...f,
      startSession: () => {
        const session = f.startSession();
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = async (callback, options) => {
          await transaction(callback, options);
          throw new Error("response lost after commit");
        };
        return session;
      },
    });
    const uncertain = await lost(input);
    expect(String(uncertain.isError() ? uncertain.getError() : undefined)).toBe(
      "RECEIPT_OUTCOME_UNKNOWN",
    );
    expect(
      await f.db.collection("conversations_receipts").countDocuments({}),
    ).toBe(2);
    expect(
      await f.db.collection("conversations_receipt_outbox").countDocuments({}),
    ).toBe(1);
    const retry = await createCommitReceipts(f)({ ...input, nowMs: 1000 });
    if (retry.isError()) throw new Error(retry.getError());
    expect(retry.get().receipts.map((receipt) => receipt.readAt)).toEqual([
      500, 500,
    ]);
    expect(
      await f.db.collection("conversations_receipt_outbox").countDocuments({}),
    ).toBe(1);
  } finally {
    await f.close();
  }
});

test("receipt index startup reports duplicate-record failure with its cause", async () => {
  const f = await createReceiptFixture();
  try {
    const { ensureReceiptIndexes } = await import(
      "../../../src/domains/conversations/adapters/mongo/receipts/indexes"
    );
    const records = f.db.collection("conversations_receipts");
    await records.dropIndex("receipt_message_recipient_unique");
    await records.insertMany([
      { messageId: "duplicate", recipientId: f.bob },
      { messageId: "duplicate", recipientId: f.bob },
    ]);
    await expect(ensureReceiptIndexes(f.db)).rejects.toThrow(
      "Receipt indexes unavailable",
    );
  } finally {
    await f.close();
  }
});

test("history receipt join ignores rows outside the returned page", async () => {
  const f = await createReceiptFixture();
  try {
    const { createReadHistory } = await import(
      "../../../src/domains/conversations/adapters/mongo/history"
    );
    await f.db.collection("conversations_receipts").insertOne({
      messageId: f.ids[1],
      recipientId: f.bob,
      conversationId: f.conversationId,
      deliveredAt: "corrupted outside page",
    });
    const history = await createReadHistory(f)({
      actorId: f.alice,
      conversationId: f.conversationId,
      range: { direction: "after", sequence: 0 },
      limit: 1,
    });
    expect(history.isOk()).toBe(true);
    if (history.isError()) throw new Error(history.getError());
    expect(history.get().items.map((message) => message.sequence)).toEqual([1]);
  } finally {
    await f.close();
  }
});

test("protected receipt reader limits snapshots to requested IDs and rejects nonmembers", async () => {
  const f = await createReceiptFixture();
  try {
    const { createReadReceipts } = await import(
      "../../../src/domains/conversations/adapters/mongo/receipts/read"
    );
    await createCommitReceipts(f)({
      actorId: f.bob,
      conversationId: f.conversationId,
      messageIds: f.ids.slice(0, 2),
      status: "read",
      nowMs: 500,
    });
    const read = createReadReceipts(f);
    const page = await read({
      actorId: f.alice,
      conversationId: f.conversationId,
      messageIds: f.ids.slice(1, 2),
    });
    if (page.isError()) throw new Error(page.getError());
    expect(page.get().receipts.map((receipt) => receipt.messageId)).toEqual(
      f.ids.slice(1, 2),
    );
    const denied = await read({
      actorId: f.mallory,
      conversationId: f.conversationId,
      messageIds: f.ids.slice(0, 2),
    });
    expect(String(denied.isError() ? denied.getError() : undefined)).toBe(
      "CONVERSATION_FORBIDDEN",
    );
  } finally {
    await f.close();
  }
});
