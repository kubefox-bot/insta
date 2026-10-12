import { expect, test } from "bun:test";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";
import { connectDeliveryFixture } from "../../../../../__tests__/fixtures/delivery/runtime";
import { createCommitMessage } from "../../../src/domains/conversations/adapters/mongo/commit-message";
import { createMongoDeliveryJournal } from "../../../src/domains/conversations/adapters/mongo/delivery/create";
import { createMongoOutbox } from "../../../src/domains/conversations/adapters/mongo/outbox";
import { createCommitReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/commit";
import { createMongoReceiptOutbox } from "../../../src/domains/conversations/adapters/mongo/receipts/outbox";
import {
  createDragonflyDeliveryStreams,
  deliveryStreamsNamespace,
  startRealtimeWorker,
  startReceiptWorker,
} from "../../../src/domains/conversations/server/index";
import { createDeliveryMaintenance } from "../../../src/domains/conversations/use-cases/delivery/maintenance";
import { createDeliveryPublishers } from "../../../src/domains/conversations/use-cases/delivery/publishers";
import { dispatchMessageOutbox } from "../../../src/domains/conversations/use-cases/messages/dispatch-outbox";
import { dispatchReceiptOutbox } from "../../../src/domains/conversations/use-cases/receipts/dispatch-outbox";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

test("idle message worker prunes real Mongo and Streams while both outboxes have zero claims", async () => {
  const fixture = await createReceiptFixture();
  const broker = await connectDeliveryFixture();
  const initial = Date.now();
  let nowMs = initial;
  const streams = createDragonflyDeliveryStreams({
    namespace: deliveryStreamsNamespace,
    client: broker.provider.client,
    openReader: broker.provider.openReader,
    clock: () => nowMs,
  });
  const journal = createMongoDeliveryJournal(fixture);
  const outbox = createMongoOutbox(fixture);
  const receipts = createMongoReceiptOutbox(fixture);
  const events = Array.from({ length: 4 }, () => crypto.randomUUID());
  try {
    for (const [index, eventId] of events.entries()) {
      if (index === 3) {
        nowMs = initial + 3;
        expect(
          (
            await createCommitReceipts({
              ...fixture,
              clock: () => nowMs,
              retentionMs: 10000,
            })({
              actorId: fixture.bob,
              conversationId: fixture.conversationId,
              messageIds: fixture.ids.slice(0, 1),
              status: "delivered",
              nowMs: initial - 500,
            })
          ).isOk(),
        ).toBe(true);
      }
      nowMs = initial + (index === 3 ? 2000 : index);
      const result = await createCommitMessage({
        ...fixture,
        clock: () => nowMs,
        retentionMs: 10000,
      })({
        actorId: fixture.alice,
        conversationId: fixture.conversationId,
        text: `idle ${index}`,
        keyDigest: crypto.randomUUID(),
        fingerprint: `idle-${index}`,
        operationId: crypto.randomUUID(),
        eventId,
        analyticsEventId: crypto.randomUUID(),
        createdAt: initial - 1000,
      });
      expect(result.isOk()).toBe(true);
    }
    const publishers = createDeliveryPublishers({
      journal,
      streams,
      clock: () => nowMs,
    });
    await dispatchMessageOutbox({
      outbox,
      sinks: { realtime: publishers.message },
      clock: () => nowMs,
      uuid: () => crypto.randomUUID(),
    });
    await dispatchReceiptOutbox({
      outbox: receipts,
      publish: publishers.receipt,
      clock: () => nowMs,
      uuid: () => crypto.randomUUID(),
    });
    const sources = fixture.db.collection("conversations_outbox");
    await sources.updateMany(
      { eventId: { $in: [events[0], events[2], events[3]] } },
      { $set: { "deliveries.analytics.state": "delivered" } },
    );
    await sources.updateOne(
      { eventId: events[2] },
      {
        $set: {
          projection: {
            deliveries: {
              ["log_only"]: { state: "pending" },
              otel: { state: "delivered" },
            },
          },
        },
      },
    );
    const pendingBefore = await sources
      .find({ eventId: { $in: [events[1], events[2]] } })
      .sort({ eventId: 1 })
      .toArray();
    const stream = {
      kind: "conversation" as const,
      id: fixture.conversationId,
    };
    const range = await journal.range({ stream, nowMs });
    if (range.kind !== "range") throw new Error("Missing published range");
    const before = await streams.inspect({ after: range.after });
    if (before.kind !== "ready") throw new Error("Missing ready stream");
    const key = `conversations:delivery:${before.generation}:conversation:${fixture.conversationId}`;
    const deadline = await broker.provider.client.send("HGET", [
      `${key}:state`,
      "expiry",
    ]);
    nowMs = initial + 11000;
    const messageClaimed = Promise.withResolvers<void>();
    const receiptClaimed = Promise.withResolvers<void>();
    let effects = 0;
    const errors: string[] = [];
    const messageWorker = startRealtimeWorker({
      maintenance: createDeliveryMaintenance({
        journal,
        streams,
        clock: () => nowMs,
      }),
      outbox: {
        ...outbox,
        claim: async (input) => {
          const claim = await outbox.claim(input);
          expect(claim).toBeNull();
          messageClaimed.resolve();
          return claim;
        },
        complete: async () => {
          effects += 1;
          return true;
        },
        expire: async () => {
          effects += 1;
          return true;
        },
        fail: async () => {
          effects += 1;
          return true;
        },
      },
      publish: async () => {
        effects += 1;
      },
      onError: () => {
        errors.push("message");
      },
    });
    const receiptWorker = startReceiptWorker({
      outbox: {
        ...receipts,
        claim: async (input) => {
          const claim = await receipts.claim(input);
          expect(claim).toBeNull();
          receiptClaimed.resolve();
          return claim;
        },
        complete: async () => {
          effects += 1;
          return true;
        },
        expire: async () => {
          effects += 1;
          return true;
        },
        fail: async () => {
          effects += 1;
          return true;
        },
      },
      publish: async () => {
        effects += 1;
      },
      onError: () => {
        errors.push("receipt");
      },
    });
    try {
      await Promise.all([messageClaimed.promise, receiptClaimed.promise]);
      await waitUntil({
        check: async () =>
          (await fixture.db
            .collection("conversations_delivery_journal")
            .countDocuments({ expiresAt: { $lte: new Date(nowMs) } })) === 0 &&
          (await broker.provider.client.send("XLEN", [`${key}:entries`])) === 1,
      });
    } finally {
      await Promise.all([messageWorker.close(), receiptWorker.close()]);
    }
    expect(effects).toBe(0);
    expect(
      await fixture.db
        .collection("conversations_receipt_outbox")
        .countDocuments({}),
    ).toBe(0);
    expect(errors).toEqual([]);
    expect(await sources.countDocuments({ eventId: events[0] })).toBe(0);
    expect(
      await sources
        .find({ eventId: { $in: [events[1], events[2]] } })
        .sort({ eventId: 1 })
        .toArray(),
    ).toEqual(pendingBefore);
    expect(await sources.countDocuments({ eventId: events[3] })).toBe(1);
    expect(
      await broker.provider.client.send("HGET", [`${key}:state`, "expiry"]),
    ).toBe(deadline);
    expect(await streams.inspect({ after: range.after })).toEqual({
      ...before,
      after: { ...range.after, cursor: 4 },
    });
    expect(await journal.range({ stream, nowMs })).toEqual({
      kind: "range",
      after: { ...range.after, cursor: 4 },
      head: range.head,
    });
  } finally {
    await streams.close();
    await broker.close();
    await fixture.close();
  }
}, 30000);
