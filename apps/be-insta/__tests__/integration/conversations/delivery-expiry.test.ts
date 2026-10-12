import { expect, test } from "bun:test";
import { createCommitMessage } from "../../../src/domains/conversations/adapters/mongo/commit-message";
import { createMongoDeliveryJournal } from "../../../src/domains/conversations/adapters/mongo/delivery/create";
import { createMongoOutbox } from "../../../src/domains/conversations/adapters/mongo/outbox";
import { createCommitReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/commit";
import { createMongoReceiptOutbox } from "../../../src/domains/conversations/adapters/mongo/receipts/outbox";
import { dispatchMessageOutbox } from "../../../src/domains/conversations/use-cases/messages/dispatch-outbox";
import { dispatchReceiptOutbox } from "../../../src/domains/conversations/use-cases/receipts/dispatch-outbox";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

test("expired realtime recovery persists terminal state without delivered timestamp and preserves pending analytics", async () => {
  const fixture = await createReceiptFixture();
  try {
    const input = {
      actorId: fixture.alice,
      conversationId: fixture.conversationId,
      text: "expiry",
      keyDigest: crypto.randomUUID(),
      fingerprint: "expiry",
      operationId: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      analyticsEventId: crypto.randomUUID(),
      createdAt: 500,
    };
    expect(
      (
        await createCommitMessage({
          ...fixture,
          clock: () => 1000,
          retentionMs: 10,
        })(input)
      ).isOk(),
    ).toBe(true);
    const outbox = createMongoOutbox({ db: fixture.db });
    const journal = createMongoDeliveryJournal(fixture);
    expect(
      await journal.forSource({
        source: { kind: "message", eventId: input.eventId },
        nowMs: 1010,
      }),
    ).toEqual({ kind: "expired" });
    await dispatchMessageOutbox({
      outbox,
      sinks: { realtime: async () => ({ kind: "expired" }) },
      clock: () => 1010,
      uuid: () => crypto.randomUUID(),
    });
    const source = await fixture.db
      .collection("conversations_outbox")
      .findOne({ eventId: input.eventId });
    expect(source?.deliveries.realtime.state).toBe("expired");
    expect(source?.deliveries.realtime.recoveryExpiredAt).toBe(1010);
    expect(source?.deliveries.realtime.deliveredAt).toBeUndefined();
    expect(source?.deliveries.analytics.state).toBe("pending");
    await journal.prune({ nowMs: 1011 });
    expect(
      await fixture.db
        .collection("conversations_outbox")
        .countDocuments({ eventId: input.eventId }),
    ).toBe(1);
    await fixture.db
      .collection("conversations_outbox")
      .updateOne(
        { eventId: input.eventId },
        { $set: { "deliveries.analytics.state": "delivered" } },
      );
    await journal.prune({ nowMs: 1011 });
    expect(
      await fixture.db
        .collection("conversations_outbox")
        .countDocuments({ eventId: input.eventId }),
    ).toBe(0);
  } finally {
    await fixture.close();
  }
});
test("receipt expiry is lease fenced and never writes publishedAt", async () => {
  const fixture = await createReceiptFixture();
  try {
    expect(
      (
        await createCommitReceipts({
          ...fixture,
          clock: () => 1000,
          retentionMs: 10,
        })({
          actorId: fixture.bob,
          conversationId: fixture.conversationId,
          messageIds: fixture.ids.slice(0, 1),
          status: "delivered",
          nowMs: 600,
        })
      ).isOk(),
    ).toBe(true);
    const outbox = createMongoReceiptOutbox({ db: fixture.db });
    const claim = await outbox.claim({ now: 1010, leaseId: "owned" });
    if (!claim || !outbox.expire) throw new Error("Missing receipt claim");
    expect(
      await outbox.expire({ ...claim, leaseId: "foreign", now: 1010 }),
    ).toBe(false);
    await outbox.fail({ ...claim, nextAttemptAt: 1010 });
    await dispatchReceiptOutbox({
      outbox,
      publish: async () => ({ kind: "expired" }),
      clock: () => 1010,
      uuid: () => crypto.randomUUID(),
    });
    const source = await fixture.db
      .collection("conversations_receipt_outbox")
      .findOne({ eventId: claim.event.eventId });
    expect(source?.state).toBe("expired");
    expect(source?.recoveryExpiredAt).toBe(1010);
    expect(source?.publishedAt).toBeUndefined();
  } finally {
    await fixture.close();
  }
});
