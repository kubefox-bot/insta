import { expect, test } from "bun:test";
import {
  createCommitMessage,
  createMongoConversations,
  ensureConversationsIndexes,
} from "../../apps/be-insta/src/domains/conversations/server/index";
import { replayOwnedCanonical } from "../fixtures/analytics/replay";
import type { OutboxDocument } from "../fixtures/analytics/types";
import { activateCanonicalUser } from "../fixtures/analytics/user";
import { createUsersEnvironment } from "../fixtures/users/environment";

test("E09 fixture replays only run-owned realtime delivery and preserves canonical/optional goal state", async () => {
  const namespace = `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`;
  const fixture = await createUsersEnvironment({
    collectionNamespace: namespace,
  });
  try {
    const alice = await activateCanonicalUser({ fixture });
    const bob = await activateCanonicalUser({ fixture });
    const outsider = await activateCanonicalUser({ fixture });
    await ensureConversationsIndexes(fixture.db);
    const conversations = createMongoConversations({
      db: fixture.db,
      startSession: fixture.database.startSession,
      clock: Date.now,
    });
    const pair = await conversations.startPair({
      participantIds: [alice.input.userId, bob.input.userId],
      operationId: fixture.operation(),
    });
    if (pair.isError()) throw new Error(pair.getError());
    const conversationId = pair.get().conversation.id;
    const eventId = crypto.randomUUID();
    const analyticsEventId = crypto.randomUUID();
    const commit = createCommitMessage({
      clock: Date.now,
      retentionMs: 86_400_000,
      db: fixture.db,
      startSession: fixture.database.startSession,
    });
    const sent = await commit({
      actorId: alice.input.userId,
      conversationId,
      text: "synthetic replay fixture",
      fingerprint: "synthetic",
      operationId: fixture.operation(),
      eventId,
      analyticsEventId,
      createdAt: Date.now(),
    });
    expect(sent.isOk()).toBe(true);
    const documents = fixture.db.collection<OutboxDocument>(
      "conversations_outbox",
    );
    await documents.updateOne(
      { _id: eventId },
      {
        $set: {
          "deliveries.realtime.state": "delivered",
          "deliveries.analytics.state": "delivered",
        },
      },
    );
    const before = await documents.findOne({ _id: eventId });
    const request = new Request(
      `http://localhost/replay-canonical?conversationId=${conversationId}`,
      { method: "POST" },
    );
    expect(
      (
        await replayOwnedCanonical({
          request: new Request(request.url),
          conversations,
          db: fixture.db,
          actorId: alice.input.userId,
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await replayOwnedCanonical({
          request,
          conversations,
          db: fixture.db,
          actorId: outsider.input.userId,
        })
      ).status,
    ).toBe(403);
    expect(
      (await documents.findOne({ _id: eventId }))?.deliveries.realtime.state,
    ).toBe("delivered");
    const replay = await replayOwnedCanonical({
      request,
      conversations,
      db: fixture.db,
      actorId: alice.input.userId,
    });
    expect(await replay.json()).toEqual({ reset: true, eventId });
    const after = await documents.findOne({ _id: eventId });
    expect(after?.analyticsEventId).toBe(analyticsEventId);
    expect(after?.operationId).toBe(before?.operationId);
    expect(after?.deliveries.realtime.state).toBe("pending");
    expect(after?.deliveries.analytics.state).toBe("delivered");
    expect(after?.projection).toEqual(before?.projection);
  } finally {
    await fixture.dispose();
  }
});
