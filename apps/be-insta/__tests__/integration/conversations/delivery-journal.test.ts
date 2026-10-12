import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { createCommitMessage } from "../../../src/domains/conversations/adapters/mongo/commit-message";
import { createReadHistory } from "../../../src/domains/conversations/adapters/mongo/history";
import { createUnreadList } from "../../../src/domains/conversations/adapters/mongo/list";
import { createCommitReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/commit";
import { createReadReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/read";
import { prepareDelivery } from "../../../src/domains/conversations/use-cases/delivery/prepare";
import type { Actor } from "../../../src/domains/users/index";
import { analyticsSinkNames } from "../../../src/lib/observability/analytics/index";
import { expectSuccess } from "../../fixtures/realtime/outcome";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

/** Формирует независимую идемпотентную команду для настоящей Mongo-транзакции. */
const messageInput = (
  fixture: Awaited<ReturnType<typeof createReceiptFixture>>,
) => ({
  actorId: fixture.alice,
  conversationId: fixture.conversationId,
  text: "journal persisted message",
  keyDigest: crypto.randomUUID(),
  fingerprint: "journal-message-content",
  operationId: crypto.randomUUID(),
  eventId: crypto.randomUUID(),
  analyticsEventId: crypto.randomUUID(),
  createdAt: 500,
});

/** Читает фактически сохранённые ссылки в изолированном пространстве теста. */
const journalRows = (
  fixture: Awaited<ReturnType<typeof createReceiptFixture>>,
) =>
  fixture.db
    .collection("conversations_delivery_journal")
    .find({})
    .sort({ streamId: 1, cursor: 1 })
    .toArray();

test("committed message atomically creates conversation and both unread references; replay preserves rows", async () => {
  const fixture = await createReceiptFixture();
  try {
    const input = messageInput(fixture);
    const commit = createCommitMessage(fixture);
    const result = await commit(input);
    expect(result.isOk()).toBe(true);
    expect(
      await fixture.db
        .collection("conversations_messages")
        .countDocuments({ text: input.text }),
    ).toBe(1);
    expect(
      await fixture.db
        .collection("conversations_outbox")
        .countDocuments({ eventId: input.eventId }),
    ).toBe(1);
    const afterFirst = await journalRows(fixture);
    expect(afterFirst).toHaveLength(3);
    expect(afterFirst.map((row) => row.streamId).sort()).toEqual(
      [
        `conversation:${fixture.conversationId}`,
        `unread:${fixture.alice}`,
        `unread:${fixture.bob}`,
      ].sort(),
    );
    expect((await commit(input)).isOk()).toBe(true);
    expect(await journalRows(fixture)).toEqual(afterFirst);
  } finally {
    await fixture.close();
  }
});

test("real transaction rollback leaves no message, source or journal partial effects", async () => {
  const fixture = await createReceiptFixture();
  try {
    const input = messageInput(fixture);
    const beforeRollback = await journalRows(fixture);
    const commit = createCommitMessage({
      ...fixture,
      startSession: () => {
        const session = fixture.startSession();
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = (callback, options) =>
          transaction(async (current) => {
            await callback(current);
            throw new Error("Rollback after all writes before commit");
          }, options);
        return session;
      },
    });
    expect((await commit(input)).isError()).toBe(true);
    expect(
      await fixture.db
        .collection("conversations_messages")
        .countDocuments({ text: input.text }),
    ).toBe(0);
    expect(
      await fixture.db
        .collection("conversations_outbox")
        .countDocuments({ eventId: input.eventId }),
    ).toBe(0);
    expect(await journalRows(fixture)).toEqual(beforeRollback);
  } finally {
    await fixture.close();
  }
});

test("delivered receipt appends one conversation reference and unchanged replay appends none", async () => {
  const fixture = await createReceiptFixture();
  try {
    const commit = createCommitReceipts(fixture);
    const input = {
      actorId: fixture.bob,
      conversationId: fixture.conversationId,
      messageIds: fixture.ids.slice(0, 1),
      status: "delivered" as const,
      nowMs: 600,
    };
    expect((await commit(input)).isOk()).toBe(true);
    expect(
      await fixture.db
        .collection("conversations_receipt_outbox")
        .countDocuments({}),
    ).toBe(1);
    const rows = await journalRows(fixture);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.streamId).toBe(`conversation:${fixture.conversationId}`);
    expect((await commit({ ...input, nowMs: 900 })).isOk()).toBe(true);
    expect(await journalRows(fixture)).toEqual(rows);
  } finally {
    await fixture.close();
  }
});

test("server clock rollback and reduced retention preserve monotonic deadlines; exact expiry and prefix prune are enforced", async () => {
  const fixture = await createReceiptFixture();
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const { pruneDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/prune"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const baseline = await journal.head({
      stream: { kind: "conversation", id: fixture.conversationId },
    });
    const serverNow = Date.now() + 86_400_000;
    const first = messageInput(fixture);
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => serverNow,
          retentionMs: 1000,
        })(first)
      ).isOk(),
    ).toBe(true);
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => serverNow - 1000,
          retentionMs: 10,
        })({ ...messageInput(fixture), createdAt: 100 })
      ).isOk(),
    ).toBe(true);
    const before = await journal.read({
      after: baseline,
      limit: 10,
      nowMs: serverNow,
    });
    if (before.kind !== "page") throw new Error("Expected retained page");
    expect(before.events.map((event) => event.recordedAt)).toEqual([
      serverNow,
      serverNow,
    ]);
    expect(before.events.map((event) => event.expiresAt)).toEqual([
      serverNow + 1000,
      serverNow + 1000,
    ]);
    const retry = createCommitMessage({
      ...fixture,
      clock: () => serverNow + 500,
      retentionMs: 9000,
    });
    expect((await retry(first)).isOk()).toBe(true);
    expect(
      await journal.read({ after: baseline, limit: 10, nowMs: serverNow }),
    ).toEqual(before);
    expect(
      await journal.read({
        after: baseline,
        limit: 10,
        nowMs: serverNow + 1000,
      }),
    ).toEqual({ kind: "resync-required" });
    const rows = await journalRows(fixture);
    expect(rows.every((row) => row.expiresAt instanceof Date)).toBe(true);
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => serverNow + 2000,
          retentionMs: 1000,
        })(messageInput(fixture))
      ).isOk(),
    ).toBe(true);
    await pruneDeliveryJournal({ ...fixture, nowMs: serverNow + 1000 });
    const retained = await journalRows(fixture);
    expect(retained).toHaveLength(3);
    expect(retained.every((row) => row.cursor === 3)).toBe(true);
    expect(
      await journal.head({
        stream: { kind: "conversation", id: fixture.conversationId },
      }),
    ).toEqual({ ...baseline, cursor: 3 });
    expect(
      await journal.read({
        after: baseline,
        limit: 10,
        nowMs: serverNow + 1000,
      }),
    ).toEqual({ kind: "resync-required" });
  } finally {
    await fixture.close();
  }
});

test("unknown commit and recreated journal preserve epoch, source replay and original receipt snapshots", async () => {
  const fixture = await createReceiptFixture();
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const baseline = await journal.head({
      stream: { kind: "conversation", id: fixture.conversationId },
    });
    const input = messageInput(fixture);
    const lost = createCommitMessage({
      ...fixture,
      startSession: () => {
        const session = fixture.startSession();
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = async (callback, options) => {
          await transaction(callback, options);
          throw new Error("Lost committed result");
        };
        return session;
      },
    });
    const committed = await lost(input);
    expect(committed.isOk()).toBe(true);
    const source = { kind: "message" as const, eventId: input.eventId };
    const first = await journal.forSource({ source, nowMs: Date.now() });
    if (first.kind !== "active") throw new Error("Expected active source");
    expect(first.events).toHaveLength(3);
    const payloads = await Promise.all(
      first.events.map((event) => journal.materialize({ event })),
    );
    expect(
      payloads.find((payload) => payload.type === "messages.created")?.data,
    ).toMatchObject({ message: { text: input.text } });
    expect((await createCommitMessage(fixture)(input)).isOk()).toBe(true);
    const restored = createMongoDeliveryJournal(fixture);
    expect(
      await restored.head({
        stream: { kind: "conversation", id: fixture.conversationId },
      }),
    ).toEqual({ ...baseline, cursor: 1 });
    expect(await restored.forSource({ source, nowMs: Date.now() })).toEqual(
      first,
    );
    expect(
      await Promise.all(
        first.events.map((event) => restored.materialize({ event })),
      ),
    ).toEqual(payloads);
    expect(
      await fixture.db
        .collection("conversations_events")
        .countDocuments({ eventId: input.eventId }),
    ).toBe(1);
    const receipts = createCommitReceipts(fixture);
    const receiptInput = {
      actorId: fixture.bob,
      conversationId: fixture.conversationId,
      messageIds: fixture.ids.slice(0, 1),
      status: "delivered" as const,
      nowMs: 600,
    };
    expect((await receipts(receiptInput)).isOk()).toBe(true);
    const receiptPage = await restored.read({
      after: { ...baseline, cursor: 1 },
      limit: 1,
      nowMs: Date.now(),
    });
    if (receiptPage.kind !== "page" || !receiptPage.events[0])
      throw new Error("Missing receipt reference");
    expect(
      (await receipts({ ...receiptInput, status: "read", nowMs: 700 })).isOk(),
    ).toBe(true);
    const receiptPayload = await restored.materialize({
      event: receiptPage.events[0],
    });
    expect(receiptPayload.data).toMatchObject({
      receipts: [{ deliveredAt: new Date(600).toISOString(), readAt: null }],
    });
    const claim = await (
      await import("../../../src/domains/conversations/adapters/mongo/outbox")
    )
      .createMongoOutbox(fixture)
      .claim({
        sink: "realtime",
        now: Date.now(),
        leaseId: crypto.randomUUID(),
      });
    expect(claim?.event).not.toHaveProperty("recoveryExpiresAt");
    expect(claim?.event).not.toHaveProperty("recoveryTargets");
  } finally {
    await fixture.close();
  }
});

test("concurrent message/receipt commits cannot expose later cursor across held commit or bootstrap head", async () => {
  const fixture = await createReceiptFixture();
  const release = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
  const pending: Promise<unknown>[] = [];
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const stream = {
      kind: "conversation" as const,
      id: fixture.conversationId,
    };
    const baseline = await journal.head({ stream });
    const input = messageInput(fixture);
    const first = createCommitMessage({
      ...fixture,
      startSession: () => {
        const session = fixture.startSession();
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = (callback, options) =>
          transaction(async (current) => {
            const value = await callback(current);
            reached.resolve();
            await release.promise;
            return value;
          }, options);
        return session;
      },
    })(input);
    pending.push(first);
    await Promise.race([
      reached.promise,
      first.then(() => {
        throw new Error("Transaction ended before commit barrier");
      }),
    ]);
    const secondStarted = Promise.withResolvers<void>();
    const second = createCommitReceipts({
      ...fixture,
      startSession: () => {
        const session = fixture.startSession();
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = (callback, options) =>
          transaction((current) => {
            secondStarted.resolve();
            return callback(current);
          }, options);
        return session;
      },
    })({
      actorId: fixture.bob,
      conversationId: fixture.conversationId,
      messageIds: fixture.ids.slice(0, 1),
      status: "delivered",
      nowMs: 900,
    });
    pending.push(second);
    await secondStarted.promise;
    expect(await journal.head({ stream })).toEqual(baseline);
    expect(
      await fixture.db
        .collection("conversations_messages", {
          readPreference: "primary",
          readConcern: { level: "majority" },
        })
        .countDocuments({ text: input.text }),
    ).toBe(0);
    release.resolve();
    expect((await first).isOk()).toBe(true);
    expect((await second).isOk()).toBe(true);
    const head = await journal.head({ stream });
    expect(head).toEqual({ ...baseline, cursor: 2 });
    const actor = {
      userId: fixture.bob,
      backendSessionId: "bootstrap",
      username: "Synthetic",
      accessExpiresAt: Date.now() + 60000,
    } as Actor;
    const prepared = expectSuccess(
      await prepareDelivery(
        { actor, target: stream, signal: new AbortController().signal },
        {
          journal,
          clock: Date.now,
          uuid: () => crypto.randomUUID(),
          authorize: async () => Result.Ok(actor),
          membership: { permits: async () => true },
        },
      ),
    );
    expect(prepared.baseline).toEqual({ ...baseline, cursor: 2 });
    // These are the actual canonical snapshot adapters called AFTER the baseline,
    // after both writes crossed real held-commit barriers above.
    const history = expectSuccess(
      await createReadHistory(fixture)({
        actorId: fixture.bob,
        conversationId: fixture.conversationId,
        range: { direction: "recent" },
        limit: 20,
      }),
    );
    expect(history.watermark).toBe(4);
    expect(history.items.some((message) => message.text === input.text)).toBe(
      true,
    );
    const unread = expectSuccess(
      await createUnreadList(fixture)({ actorId: fixture.bob, limit: 20 }),
    );
    expect(
      unread.items.find((item) => item.id === fixture.conversationId)
        ?.unreadCount,
    ).toBe(3);
    const receipts = expectSuccess(
      await createReadReceipts(fixture)({
        actorId: fixture.bob,
        conversationId: fixture.conversationId,
        messageIds: fixture.ids.slice(0, 1),
      }),
    );
    expect(receipts.receipts[0]?.deliveredAt).toBe(900);

    const page = await journal.read({
      after: baseline,
      limit: 10,
      nowMs: Date.now(),
    });
    if (page.kind !== "page")
      throw new Error("Expected complete boundary replay");
    expect(page.events.map((event) => event.cursor)).toEqual([1, 2]);
    expect(page.events.map((event) => event.source.kind)).toEqual([
      "message",
      "receipt",
    ]);
    expect(
      await fixture.db
        .collection("conversations_messages", {
          readPreference: "primary",
          readConcern: { level: "majority" },
        })
        .countDocuments({ text: input.text }),
    ).toBe(1);
    expect(
      await fixture.db
        .collection("conversations_receipts", {
          readPreference: "primary",
          readConcern: { level: "majority" },
        })
        .countDocuments({}),
    ).toBe(1);
  } finally {
    release.resolve();
    await Promise.allSettled(pending);
    await fixture.close();
  }
}, 30_000);

test("partial target expiry preserves maximum source deadline and every pending analytics sink; missing live target fails", async () => {
  const fixture = await createReceiptFixture();
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const { pruneDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/prune"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const serverNow = Date.now() + 86_400_000;
    const unreadHead = await journal.head({
      stream: { kind: "unread", id: fixture.bob },
    });
    await fixture.db.collection("conversations_delivery_metadata").updateOne(
      { streamId: unreadHead.streamId },
      {
        $set: { lastRecordedAt: serverNow, lastExpiresAt: serverNow + 5000 },
      },
    );
    const input = messageInput(fixture);
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => serverNow,
          retentionMs: 1000,
        })(input)
      ).isOk(),
    ).toBe(true);
    const source = { kind: "message" as const, eventId: input.eventId };
    const sources = fixture.db.collection("conversations_outbox");
    expect(
      (await sources.findOne({ eventId: input.eventId }))?.recoveryExpiresAt,
    ).toEqual(new Date(serverNow + 5000));
    await pruneDeliveryJournal({ ...fixture, nowMs: serverNow + 1000 });
    const partial = await journal.forSource({
      source,
      nowMs: serverNow + 1000,
    });
    if (partial.kind !== "active")
      throw new Error("Expected remaining live target");
    expect(partial.events).toHaveLength(1);
    expect(partial.events[0]?.streamId).toBe(unreadHead.streamId);
    const live = (await journalRows(fixture))[0];
    if (!live) throw new Error("Missing retained row");
    await fixture.db
      .collection("conversations_delivery_journal")
      .deleteOne({ _id: live._id });
    await expect(
      journal.forSource({ source, nowMs: serverNow + 1000 }),
    ).rejects.toThrow();
    await fixture.db
      .collection("conversations_delivery_journal")
      .insertOne(live);
    await sources.updateOne(
      { eventId: input.eventId },
      { $set: { "deliveries.realtime.state": "delivered" } },
    );
    await pruneDeliveryJournal({ ...fixture, nowMs: serverNow + 5000 });
    expect(await sources.countDocuments({ eventId: input.eventId })).toBe(1);
    expect(
      await journal.forSource({ source, nowMs: serverNow + 5000 }),
    ).toEqual({ kind: "expired" });
    await sources.updateOne(
      { eventId: input.eventId },
      {
        $set: {
          "deliveries.analytics.state": "delivered",
          projection: {
            reference: {
              contextId: "synthetic",
              revision: 1,
              policyVersion: 1,
              generation: "synthetic",
            },
            deliveries: {
              [analyticsSinkNames.logOnly]: {
                state: "pending",
                leaseUntil: 0,
                nextAttemptAt: 0,
              },
              otel: { state: "pending", leaseUntil: 0, nextAttemptAt: 0 },
            },
          },
        },
      },
    );
    await pruneDeliveryJournal({ ...fixture, nowMs: serverNow + 5000 });
    expect(await sources.countDocuments({ eventId: input.eventId })).toBe(1);
    await sources.updateOne(
      { eventId: input.eventId },
      { $set: { "projection.deliveries.log_only.state": "delivered" } },
    );
    await pruneDeliveryJournal({ ...fixture, nowMs: serverNow + 5000 });
    expect(await sources.countDocuments({ eventId: input.eventId })).toBe(1);
    await sources.updateOne(
      { eventId: input.eventId },
      { $set: { "projection.deliveries.otel.state": "denied" } },
    );
    await pruneDeliveryJournal({ ...fixture, nowMs: serverNow + 5000 });
    expect(await sources.countDocuments({ eventId: input.eventId })).toBe(0);
    expect(
      await fixture.db
        .collection("conversations_messages")
        .countDocuments({ text: input.text }),
    ).toBe(1);
    expect(
      await fixture.db
        .collection("conversations_events")
        .countDocuments({ eventId: input.eventId }),
    ).toBe(1);
    expect(
      (await sources.listIndexes().toArray()).some(
        (index) => index.expireAfterSeconds !== undefined,
      ),
    ).toBe(false);
  } finally {
    await fixture.close();
  }
});

test("source kind isolates colliding event IDs and corrupt live journal rows are not silently skipped", async () => {
  const fixture = await createReceiptFixture();
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const input = messageInput(fixture);
    expect((await createCommitMessage(fixture)(input)).isOk()).toBe(true);
    expect(
      (
        await createCommitReceipts(fixture)({
          actorId: fixture.bob,
          conversationId: fixture.conversationId,
          messageIds: fixture.ids.slice(0, 1),
          status: "read",
          nowMs: 800,
        })
      ).isOk(),
    ).toBe(true);
    const receiptSources = fixture.db.collection<{
      _id: string;
      eventId: string;
    }>("conversations_receipt_outbox");
    const original = await receiptSources.findOne({});
    if (!original) throw new Error("Expected receipt source");
    await receiptSources.deleteOne({ _id: original._id });
    await receiptSources.insertOne({
      ...original,
      _id: input.eventId,
      eventId: input.eventId,
    });
    await fixture.db
      .collection("conversations_delivery_journal")
      .updateMany(
        { "source.kind": "receipt", "source.eventId": original.eventId },
        { $set: { eventId: input.eventId, "source.eventId": input.eventId } },
      );
    const message = await journal.forSource({
      source: { kind: "message", eventId: input.eventId },
      nowMs: Date.now(),
    });
    const receipt = await journal.forSource({
      source: { kind: "receipt", eventId: input.eventId },
      nowMs: Date.now(),
    });
    if (message.kind !== "active" || receipt.kind !== "active")
      throw new Error("Expected active sources");
    expect(message.events).toHaveLength(3);
    expect(receipt.events).toHaveLength(2);
    expect(receipt.events[0]?.source.kind).toBe("receipt");
    const event = message.events[0];
    if (!event) throw new Error("Expected message reference");
    await fixture.db
      .collection("conversations_delivery_journal")
      .updateOne(
        { streamId: event.streamId, cursor: event.cursor },
        { $set: { recordedAt: "corrupt" } },
      );
    await expect(
      journal.forSource({
        source: { kind: "message", eventId: input.eventId },
        nowMs: Date.now(),
      }),
    ).rejects.toThrow();
  } finally {
    await fixture.close();
  }
});

test("range restores retained suffix after durable trim and rejects a missing first live row", async () => {
  const fixture = await createReceiptFixture();
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const stream = {
      kind: "conversation" as const,
      id: fixture.conversationId,
    };
    const empty = await journal.head({ stream });
    expect(await journal.range({ stream, nowMs: Date.now() })).toEqual({
      kind: "range",
      after: empty,
      head: empty,
    });
    const anchor = Date.now() + 86_400_000;
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => anchor,
          retentionMs: 1000,
        })(messageInput(fixture))
      ).isOk(),
    ).toBe(true);
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => anchor + 1000,
          retentionMs: 1000,
        })(messageInput(fixture))
      ).isOk(),
    ).toBe(true);
    expect(await journal.prune({ nowMs: anchor + 1000 })).toEqual({
      removed: 3,
    });
    expect(await journal.range({ stream, nowMs: anchor + 1000 })).toEqual({
      kind: "range",
      after: { ...empty, cursor: 1 },
      head: { ...empty, cursor: 2 },
    });
    await fixture.db
      .collection("conversations_delivery_journal")
      .deleteOne({ streamId: empty.streamId, cursor: 2 });
    expect(await journal.range({ stream, nowMs: anchor + 1000 })).toEqual({
      kind: "resync-required",
    });
    expect(await journal.range({ stream, nowMs: anchor + 2000 })).toEqual({
      kind: "resync-required",
    });
  } finally {
    await fixture.close();
  }
});

test("physical prune is bounded and atomically advances durable floor; all expired range returns head", async () => {
  const fixture = await createReceiptFixture();
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const stream = {
      kind: "conversation" as const,
      id: fixture.conversationId,
    };
    const baseline = await journal.head({ stream });
    const anchor = Date.now() + 86_400_000;
    await fixture.db.collection("conversations_delivery_metadata").updateOne(
      { streamId: baseline.streamId },
      {
        $set: {
          cursor: 65,
          lastRecordedAt: anchor,
          lastExpiresAt: anchor + 1000,
        },
      },
    );
    await fixture.db.collection("conversations_delivery_journal").insertMany(
      Array.from({ length: 65 }, (_, index) => {
        const eventId = crypto.randomUUID();
        return {
          ...baseline,
          cursor: index + 1,
          eventId,
          eventType: "messages.created",
          source: { kind: "message", eventId },
          createdAt: 100,
          recordedAt: new Date(anchor),
          expiresAt: new Date(anchor + 1000),
        };
      }),
    );
    const aborted = createMongoDeliveryJournal({
      ...fixture,
      startSession: () => {
        const session = fixture.startSession();
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = (callback, options) =>
          transaction(async (current) => {
            await callback(current);
            throw new Error("Abort prune before commit");
          }, options);
        return session;
      },
    });
    await expect(aborted.prune({ nowMs: anchor + 1000 })).rejects.toThrow(
      "Abort prune before commit",
    );
    expect(await journalRows(fixture)).toHaveLength(65);
    expect(
      (
        await fixture.db
          .collection("conversations_delivery_metadata")
          .findOne({ streamId: baseline.streamId })
      )?.trimmedThrough,
    ).toBe(0);
    expect(await journal.prune({ nowMs: anchor + 1000 })).toEqual({
      removed: 64,
    });
    expect(
      (
        await fixture.db
          .collection("conversations_delivery_metadata")
          .findOne({ streamId: baseline.streamId })
      )?.trimmedThrough,
    ).toBe(64);
    expect((await journalRows(fixture)).map((row) => row.cursor)).toEqual([65]);
    expect(await journal.range({ stream, nowMs: anchor + 1000 })).toEqual({
      kind: "range",
      after: { ...baseline, cursor: 65 },
      head: { ...baseline, cursor: 65 },
    });
    expect(await journal.prune({ nowMs: anchor + 1000 })).toEqual({
      removed: 1,
    });
    expect(await journal.range({ stream, nowMs: anchor + 1000 })).toEqual({
      kind: "range",
      after: { ...baseline, cursor: 65 },
      head: { ...baseline, cursor: 65 },
    });
  } finally {
    await fixture.close();
  }
});

test("range keeps one coherent snapshot when prune commits between metadata and interval count", async () => {
  const fixture = await createReceiptFixture();
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const pending: Promise<unknown>[] = [];
  try {
    const { createMongoDeliveryJournal } = await import(
      "../../../src/domains/conversations/adapters/mongo/delivery/create"
    );
    const journal = createMongoDeliveryJournal(fixture);
    const stream = {
      kind: "conversation" as const,
      id: fixture.conversationId,
    };
    const baseline = await journal.head({ stream });
    const anchor = Date.now() + 86_400_000;
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => anchor,
          retentionMs: 1000,
        })(messageInput(fixture))
      ).isOk(),
    ).toBe(true);
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => anchor + 1000,
          retentionMs: 1000,
        })(messageInput(fixture))
      ).isOk(),
    ).toBe(true);
    const barrierDb = new Proxy(fixture.db, {
      get(target, property) {
        if (property === "collection")
          return (
            name: string,
            options?: import("mongodb").CollectionOptions,
          ) => {
            const collection = target.collection(name, options);
            if (name === "conversations_delivery_journal") {
              const count = collection.countDocuments.bind(collection);
              collection.countDocuments = async (filter, options) => {
                reached.resolve();
                await release.promise;
                return count(filter, options);
              };
            }
            return collection;
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const range = createMongoDeliveryJournal({
      ...fixture,
      db: barrierDb,
    }).range({ stream, nowMs: anchor + 1000 });
    pending.push(range);
    await Promise.race([
      reached.promise,
      range.then(() => {
        throw new Error("Range ended before count barrier");
      }),
    ]);
    expect(await journal.prune({ nowMs: anchor + 1000 })).toEqual({
      removed: 3,
    });
    release.resolve();
    expect(await range).toEqual({
      kind: "range",
      after: { ...baseline, cursor: 1 },
      head: { ...baseline, cursor: 2 },
    });
  } finally {
    release.resolve();
    await Promise.allSettled(pending);
    await fixture.close();
  }
}, 30_000);
