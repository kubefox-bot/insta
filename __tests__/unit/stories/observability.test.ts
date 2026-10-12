import { expect, test } from "bun:test";
import { canonicalStory } from "../../../apps/be-insta/src/domains/stories/business/canonical";
import { originalProjection } from "../../../apps/be-insta/src/lib/observability/analytics/projection";
import { canonicalSchema } from "../../../apps/be-insta/src/lib/observability/analytics/schema";

test("canonical publication is keyed by the effect and preserves bounded non-UUID operation correlation", () => {
  const eventId = crypto.randomUUID();
  const operationId = "native_operation-1";
  const event = canonicalStory({
    claim: {
      actorId: "synthetic",
      operationId,
      attemptId: "attempt",
      profile: "private-profile",
      key: "private-object.mp4",
      now: 1000,
      leaseUntil: 2000,
    },
    storyId: "story",
    eventId,
    author: { id: "synthetic", username: "public" },
    now: 1000,
    expiresAt: 2000,
    media: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      durationMs: 1000,
    },
  });
  expect(event).toMatchObject({
    analyticsEventId: eventId,
    effectId: "story",
    operationId,
  });
  const projection = originalProjection({
    contextId: "context",
    revision: 1,
    policyVersion: 1,
    generation: "generation",
  });
  expect(canonicalSchema.safeParse({ ...event, ...projection }).success).toBe(
    true,
  );
  const serialized = JSON.stringify(event);
  for (const secret of [
    "private-profile",
    "private-object.mp4",
    "accessToken",
    "playbackUrl",
  ])
    expect(serialized).not.toContain(secret);
});
test("canonical operation correlation rejects malformed/overlong identifiers and accepts existing UUID", () => {
  const record = {
    analyticsEventId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    operation: "story.publish",
    code: "STORY_PUBLISHED",
    effectId: "effect",
    authority: "server_canonical",
    occurredAt: 1,
    ...originalProjection({
      contextId: "context",
      revision: 1,
      policyVersion: 1,
      generation: "generation",
    }),
  };
  expect(canonicalSchema.safeParse(record).success).toBe(true);
  for (const operationId of [
    "",
    "x".repeat(129),
    "a/b",
    "https://signed.invalid?token=secret",
    "line\nbreak",
  ])
    expect(canonicalSchema.safeParse({ ...record, operationId }).success).toBe(
      false,
    );
});
