import { expect, test } from "bun:test";
import { consentPolicyVersion } from "@insta/contracts/privacy";
import { logFields } from "@insta/fe-core/observability/contracts";
import { createPinoAdapter } from "@insta/fe-core/observability/server";
import { readStoryPlaybackGoal } from "../../../apps/fe-insta/src/domains/stories/domain/playback/goal";
import { createClientIntake } from "../../../apps/fe-insta/src/lib/observability/server/intake";

test("story.play intake derives only its owned goal, deduplicates and requires current consent", async () => {
  const lines: string[] = [];
  const logger = createPinoAdapter({
    resolveClientGoal: readStoryPlaybackGoal,
    identity: {
      app: "insta",
      [logFields.serviceName]: "fe-insta",
      source: "server",
    },
    destination: {
      write: (line) => {
        lines.push(line);
      },
    },
  });
  const emitted = () => lines.map((line) => JSON.parse(line).client);
  const intake = createClientIntake({
    clock: () => 0,
    emit: (event) =>
      logger.logger.info({
        [logFields.eventType]: "client_observed",
        client: event,
      }),
  });
  const event = {
    analyticsEventId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    operation: "story.play",
    code: "PLAYING",
    authority: "server_canonical",
    goal: "registration_completed",
    url: "https://private/signed.mp4",
  };
  const input = {
    source: "synthetic",
    preference: {
      choice: "all" as const,
      revision: 1,
      policyVersion: consentPolicyVersion,
    },
    payload: {
      revision: 1,
      policyVersion: consentPolicyVersion,
      events: [event],
    },
  };
  expect(await intake(input)).toBe("accepted");
  expect(emitted()).toEqual([
    {
      analyticsEventId: event.analyticsEventId,
      operationId: event.operationId,
      operation: "story.play",
      code: "PLAYING",
      authority: "client_observed",
      goal: "story_play_started",
    },
  ]);
  expect(await intake(input)).toBe("accepted");
  expect(emitted()).toHaveLength(1);
  expect(
    await intake({
      ...input,
      preference: { ...input.preference, choice: "necessary" },
    }),
  ).toBe("denied");
  expect(
    await intake({
      ...input,
      preference: { ...input.preference, revision: 2 },
    }),
  ).toBe("denied");
  expect(emitted()).toHaveLength(1);
  await logger.close();
  expect(
    readStoryPlaybackGoal({
      operation: "story.play",
      code: "PLAYING",
      authority: "server_canonical",
    }),
  ).toBeUndefined();
  expect(
    readStoryPlaybackGoal({
      operation: "story.play",
      code: "PREFETCH",
      authority: "client_observed",
    }),
  ).toBeUndefined();
  expect(
    readStoryPlaybackGoal({
      operation: "story.publish",
      code: "PLAYING",
      authority: "client_observed",
    }),
  ).toBeUndefined();
});
