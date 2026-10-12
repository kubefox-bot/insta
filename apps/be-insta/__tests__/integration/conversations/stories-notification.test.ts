import { expect, test } from "bun:test";
import {
  realtimeEventTypes,
  realtimeKinds,
  realtimeProtocolVersion,
  storiesFeedStream,
} from "@insta/contracts/realtime";
import {
  completeFeedNotification,
  createMongoDeliveryJournal,
  recordFeedNotification,
} from "../../../src/domains/conversations/server/index";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

const payload = () =>
  ({
    version: realtimeProtocolVersion,
    kind: realtimeKinds.event,
    type: realtimeEventTypes.storiesChanged,
    eventId: crypto.randomUUID(),
    occurredAt: new Date(1000).toISOString(),
    meta: { requestId: crypto.randomUUID() },
    data: {},
  }) as const;
test("public feed notification rolls back atomically, persists payload and replays across cursor/time inversion", async () => {
  const fixture = await createReceiptFixture();
  const session = fixture.startSession();
  try {
    const journal = createMongoDeliveryJournal(fixture);
    const initial = await journal.head({ stream: storiesFeedStream });
    await expect(
      session.withTransaction(async () => {
        await recordFeedNotification({
          db: fixture.db,
          session,
          payload: payload(),
          retentionMs: 86400000,
          serverNowMs: 1000,
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await journal.head({ stream: storiesFeedStream })).toEqual(initial);
    const first = payload();
    const second = payload();
    for (const [event, now] of [
      [first, 2000],
      [second, 1000],
    ] as const)
      await session.withTransaction(() =>
        recordFeedNotification({
          db: fixture.db,
          session,
          payload: event,
          retentionMs: 86400000,
          serverNowMs: now,
        }),
      );
    const page = await journal.read({ after: initial, limit: 10, nowMs: 2001 });
    expect(page.kind).toBe("page");
    if (page.kind !== "page") throw new Error("missing page");
    expect(page.events.map((event) => event.cursor)).toEqual([1, 2]);
    expect(page.events[1]?.expiresAt).toBe(page.events[0]?.expiresAt);
    const source = await journal.forSource({
      source: { kind: "notification", eventId: first.eventId },
      nowMs: 2001,
    });
    expect(source.kind).toBe("active");
    if (source.kind !== "active" || !source.events[0])
      throw new Error("source missing");
    expect(await journal.materialize({ event: source.events[0] })).toEqual(
      first,
    );
  } finally {
    await session.endSession();
    await fixture.close();
  }
});

test("Story publication and notification share commit/rollback; operation replay does not append again", async () => {
  const fixture = await createReceiptFixture();
  try {
    const { createStoriesPersistence } = await import(
      "../../../src/domains/stories/server/index"
    );
    let fail = true;
    let failAcknowledgement = true;
    const persistence = await createStoriesPersistence({
      ...fixture,
      acknowledgePublication: async ({ session, eventId }) => {
        await completeFeedNotification({ db: fixture.db, session, eventId });
        if (failAcknowledgement) throw new Error("completion rollback");
      },
      recordPublication: async ({ session, event }) => {
        await recordFeedNotification({
          db: fixture.db,
          session,
          payload: { ...payload(), eventId: event.eventId },
          retentionMs: 86400000,
          serverNowMs: 2000,
        });
        if (fail) throw new Error("before commit");
      },
    });
    const claim = {
      actorId: fixture.alice,
      operationId: crypto.randomUUID(),
      attemptId: crypto.randomUUID(),
      profile: "test",
      key: "test/key",
      now: 1000,
      leaseUntil: 100000,
    };
    await persistence.uploads.claim(claim);
    const input = {
      claim,
      storyId: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      author: { id: fixture.alice, username: "synthetic" },
      media: {
        container: "mp4" as const,
        videoCodec: "h264" as const,
        audioCodec: "aac" as const,
        durationMs: 1000,
      },
      now: 2000,
      expiresAt: 86402000,
    };
    expect((await persistence.persistence.publish(input)).isError()).toBe(true);
    expect(await fixture.db.collection("stories").countDocuments({})).toBe(0);
    expect(
      await fixture.db
        .collection("conversations_delivery_journal")
        .countDocuments({}),
    ).toBe(0);
    fail = false;
    expect((await persistence.persistence.publish(input)).isOk()).toBe(true);
    expect((await persistence.persistence.publish(input)).isOk()).toBe(true);
    expect(await fixture.db.collection("stories").countDocuments({})).toBe(1);
    expect(
      await fixture.db.collection("stories_outbox").countDocuments({}),
    ).toBe(1);
    expect(
      await fixture.db
        .collection("conversations_delivery_journal")
        .countDocuments({}),
    ).toBe(1);
    await expect(persistence.outbox.acknowledge(input.eventId)).rejects.toThrow(
      "completion rollback",
    );
    expect(
      (
        await fixture.db
          .collection("stories_outbox")
          .findOne({ eventId: input.eventId })
      )?.state,
    ).toBe("pending");
    expect(
      (
        await fixture.db
          .collection("delivery_notifications")
          .findOne({ eventId: input.eventId })
      )?.state,
    ).toBe("pending");
    failAcknowledgement = false;
    await persistence.outbox.acknowledge(input.eventId);
    expect(
      (
        await fixture.db
          .collection("delivery_notifications")
          .findOne({ eventId: input.eventId })
      )?.state,
    ).toBe("delivered");
  } finally {
    await fixture.close();
  }
});

test("missing live notification is an integrity error; expiry preserves pending source until completion", async () => {
  const fixture = await createReceiptFixture();
  const session = fixture.startSession();
  try {
    const journal = createMongoDeliveryJournal(fixture);
    const event = payload();
    await session.withTransaction(() =>
      recordFeedNotification({
        db: fixture.db,
        session,
        payload: event,
        retentionMs: 1000,
        serverNowMs: 1000,
      }),
    );
    expect(
      (
        await journal.forSource({
          source: { kind: "notification", eventId: event.eventId },
          nowMs: 2000,
        })
      ).kind,
    ).toBe("expired");
    await journal.prune({ nowMs: 2000 });
    expect(
      await fixture.db.collection("delivery_notifications").countDocuments({}),
    ).toBe(1);
    await session.withTransaction(() =>
      completeFeedNotification({
        db: fixture.db,
        session,
        eventId: event.eventId,
      }),
    );
    await journal.prune({ nowMs: 2000 });
    expect(
      await fixture.db.collection("delivery_notifications").countDocuments({}),
    ).toBe(0);
    const live = payload();
    await session.withTransaction(() =>
      recordFeedNotification({
        db: fixture.db,
        session,
        payload: live,
        retentionMs: 1000,
        serverNowMs: 3000,
      }),
    );
    await fixture.db
      .collection("conversations_delivery_journal")
      .deleteOne({ eventId: live.eventId });
    await expect(
      journal.forSource({
        source: { kind: "notification", eventId: live.eventId },
        nowMs: 3000,
      }),
    ).rejects.toThrow();
  } finally {
    await session.endSession();
    await fixture.close();
  }
});
