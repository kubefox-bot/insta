import { expect, test } from "bun:test";
import { storyCollections } from "../../../apps/be-insta/src/domains/stories/adapters/mongo/conts";
import { createStoriesPersistence } from "../../../apps/be-insta/src/domains/stories/server/index";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { readTestApiConfig } from "../../fixtures/environment";

test("publication, canonical identity and original consent projection commit atomically; replay never backfills necessary effects", async () => {
  const database = await connectDatabase({ config: readTestApiConfig().mongo });
  const actorId = crypto.randomUUID();
  const reference = {
    contextId: crypto.randomUUID(),
    revision: 1,
    policyVersion: 1,
    generation: crypto.randomUUID(),
  };
  const mode = { all: false };
  const persistence = await createStoriesPersistence({
    db: database.apiDb,
    startSession: database.startSession,
    analyticsReference: () => (mode.all ? reference : undefined),
  });
  const prepare = async (operationId: string) => {
    const now = Date.now();
    const claim = {
      actorId,
      operationId,
      attemptId: crypto.randomUUID(),
      profile: "private-observability-profile",
      key: `private-object-${crypto.randomUUID()}.mp4`,
      now,
      leaseUntil: now + 120000,
    };
    await persistence.uploads.claim(claim);
    return {
      claim,
      storyId: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      author: { id: actorId, username: "synthetic" },
      media: {
        container: "mp4" as const,
        videoCodec: "h264" as const,
        audioCodec: "aac" as const,
        durationMs: 1000,
      },
      now,
      expiresAt: now + 86400000,
    };
  };
  try {
    const necessary = await prepare("necessary-operation");
    expect((await persistence.persistence.publish(necessary)).isOk()).toBe(
      true,
    );
    mode.all = true;
    expect((await persistence.persistence.publish(necessary)).isOk()).toBe(
      true,
    );
    const optional = await prepare("optional-operation");
    expect((await persistence.persistence.publish(optional)).isOk()).toBe(true);
    const rows = await database.apiDb
      .collection(storyCollections.outbox)
      .find({ actorId })
      .toArray();
    expect(rows).toHaveLength(2);
    const original = rows.find(
      (row) => row.operationId === necessary.claim.operationId,
    );
    const consented = rows.find(
      (row) => row.operationId === optional.claim.operationId,
    );
    expect(original?.projection).toBeUndefined();
    expect(consented).toMatchObject({
      eventId: optional.eventId,
      analyticsEventId: optional.eventId,
      effectId: optional.storyId,
      authority: "server_canonical",
      operation: "story.publish",
      projection: { reference },
    });
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      for (const forbidden of [
        "private-object",
        "private-observability-profile",
        "signedUrl",
        "accessToken",
      ])
        expect(serialized).not.toContain(forbidden);
    }
    const rejected = await prepare("duplicate-event-operation");
    const collision = await persistence.persistence.publish({
      ...rejected,
      eventId: optional.eventId,
    });
    expect(collision.isError()).toBe(true);
    expect(
      await database.apiDb
        .collection<{ _id: string }>(storyCollections.stories)
        .countDocuments({ _id: rejected.storyId }),
    ).toBe(0);
    expect((await persistence.persistence.read(rejected.claim)).state).toBe(
      "pending",
    );
    expect(
      await database.apiDb
        .collection(storyCollections.outbox)
        .countDocuments({ actorId }),
    ).toBe(2);
  } finally {
    for (const name of Object.values(storyCollections))
      await database.apiDb
        .collection<{ _id: string; actorId?: string }>(name)
        .deleteMany(
          name === storyCollections.authors ? { _id: actorId } : { actorId },
        );
    await database.close();
  }
}, 30000);
