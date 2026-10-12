import { expect, test } from "bun:test";
import {
  connectDragonfly,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import {
  createDragonflyIntents,
  createIntent,
  resolveResume,
} from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";
import { readTestApiConfig } from "../../fixtures/environment";
import { requireSuccess } from "../../fixtures/outcome";

test("real Dragonfly persists story target and replays only the original operation and activated generation", async () => {
  const client = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const generation = await readGeneration(client);
  const namespace = `story05_${crypto.randomUUID().replaceAll("-", "")}`;
  const intentId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  try {
    const intents = createDragonflyIntents({ client, generation, namespace });
    const now = Date.now();
    const actor = { userId: "owner", generation: "S1" };
    requireSuccess(
      await createIntent(
        {
          input: { type: "resume_story", operationId },
          context: "protected",
          actor,
          now,
          registrationExpiresAt: now + 60000,
        },
        { intents, uuid: () => intentId },
      ),
    );
    const target = { type: "resume_story" as const, operationId };
    const targets = { resolve: async () => target };
    const input = { intentId, context: "protected", actor, now: now + 1 };
    expect(
      requireSuccess(await resolveResume(input, { intents, targets })),
    ).toEqual(target);
    const reloaded = createDragonflyIntents({ client, generation, namespace });
    expect((await reloaded.find(intentId))?.target).toEqual(target);
    expect(
      requireSuccess(
        await resolveResume(input, { intents: reloaded, targets }),
      ),
    ).toEqual(target);
    expect(
      (
        await resolveResume(
          { ...input, actor: { userId: "other", generation: "S1" } },
          { intents: reloaded, targets },
        )
      ).isError(),
    ).toBe(true);
    expect(
      (
        await resolveResume(
          { ...input, actor: { ...actor, generation: "S2" } },
          { intents: reloaded, targets },
        )
      ).isError(),
    ).toBe(true);
    const raw = await client.get(`auth:${generation}:${namespace}:${intentId}`);
    expect(raw).not.toContain("previewId");
    expect(raw).not.toContain("blob:");
  } finally {
    await client.del(`auth:${generation}:${namespace}:${intentId}`);
    client.close();
  }
});
