import { expect, test } from "bun:test";
import { bootstrapGeneration } from "../../apps/be-insta/src/lib/dragonfly/bootstrap";
import { readGeneration } from "../../apps/be-insta/src/lib/dragonfly/index";
import {
  createDragonflyIntents,
  createIntent,
  resolveResume,
} from "../../apps/fe-insta/src/domains/auth-continuation/server/index";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { docker } from "../fixtures/docker";
import { startBroker } from "../fixtures/isolated-broker";
import { requireFailure } from "../fixtures/outcome";

test("restored pre-consume snapshot and stopped broker fail closed without resuming old intent", async () => {
  const runId = `insta-auth05-${crypto.randomUUID()}`;
  await docker(
    "volume",
    "create",
    "--label",
    `insta.testRunId=${runId}`,
    runId,
  );
  const resources: OwnedResource[] = [{ kind: "volume", id: runId }];
  const { client } = await startBroker(runId, resources);
  const id = crypto.randomUUID();
  const targets = {
    resolve: async () => ({
      type: "compose_message" as const,
      conversationId: "safe",
    }),
  };
  const input = {
    intentId: id,
    context: "context",
    actor: { userId: "actor", generation: "S1" },
    now: Date.now(),
  };
  try {
    await bootstrapGeneration(client);
    const generation = await readGeneration(client);
    const intents = createDragonflyIntents({ client, generation });
    expect(
      (
        await createIntent(
          {
            input: {
              type: "compose_message",
              recipientId: "recipient",
              operationId: crypto.randomUUID(),
            },
            context: "context",
            now: input.now,
          },
          { intents, uuid: () => id },
        )
      ).isOk(),
    ).toBe(true);
    expect(await client.send("SAVE", [])).toBe("OK");
    expect((await resolveResume(input, { intents, targets })).isOk()).toBe(
      true,
    );
    await docker("kill", "--signal", "KILL", runId);
    client.close();
    expect(
      String(requireFailure(await resolveResume(input, { intents, targets }))),
    ).toBe("INTENT_UNAVAILABLE");
    await docker("rm", runId);
    resources.pop();
    const restored = await startBroker(runId, resources);
    try {
      const oldIntents = createDragonflyIntents({
        client: restored.client,
        generation,
      });
      expect(
        String(
          requireFailure(
            await resolveResume(input, { intents: oldIntents, targets }),
          ),
        ),
      ).toBe("INTENT_UNAVAILABLE");
      await bootstrapGeneration(restored.client);
      expect(
        String(
          requireFailure(
            await resolveResume(input, { intents: oldIntents, targets }),
          ),
        ),
      ).toBe("INTENT_UNAVAILABLE");
      const current = createDragonflyIntents({
        client: restored.client,
        generation: await readGeneration(restored.client),
      });
      expect(
        String(
          requireFailure(
            await resolveResume(input, { intents: current, targets }),
          ),
        ),
      ).toBe("INTENT_UNAVAILABLE");
    } finally {
      restored.client.close();
    }
  } finally {
    client.close();
    await cleanupResources({ testRunId: runId, resources, execute: docker });
  }
}, 60000);
