import { expect, test } from "bun:test";
import type {
  SessionId,
  UserId,
} from "../../../apps/be-insta/src/domains/users/index";
import { createDragonflyWsTickets } from "../../../apps/be-insta/src/domains/users/server/index";
import { bootstrapGeneration } from "../../../apps/be-insta/src/lib/dragonfly/bootstrap";
import { generationKey } from "../../../apps/be-insta/src/lib/dragonfly/conts";
import { readGeneration } from "../../../apps/be-insta/src/lib/dragonfly/index";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { docker } from "../../fixtures/docker";
import { startBroker } from "../../fixtures/isolated-broker";

test("old WS tickets cannot cross an isolated broker generation change", async () => {
  const runId = `insta-auth06-${crypto.randomUUID()}`;
  const resources: OwnedResource[] = [];
  await docker(
    "volume",
    "create",
    "--label",
    `insta.testRunId=${runId}`,
    runId,
  );
  resources.push({ kind: "volume", id: runId });
  const broker = await startBroker(runId, resources);
  try {
    await bootstrapGeneration(broker.client);
    const generation = await readGeneration(broker.client);
    const tickets = createDragonflyWsTickets({ client: broker.client });
    const ticket = crypto.randomUUID();
    const actor = {
      userId: "012345678901234567890123" as UserId,
      backendSessionId: crypto.randomUUID() as SessionId,
      username: "Synthetic",
      accessExpiresAt: Date.now() + 60000,
    };
    await tickets.issue({ ticket, actor, expiresAt: Date.now() + 30000 });
    await broker.client.set(
      generationKey,
      `${generation.slice(0, 40)}:${crypto.randomUUID()}`,
    );
    expect(await tickets.consume({ ticket, now: Date.now() })).toBeNull();
    const fresh = crypto.randomUUID();
    await tickets.issue({
      ticket: fresh,
      actor,
      expiresAt: Date.now() + 30000,
    });
    expect(await tickets.consume({ ticket: fresh, now: Date.now() })).toEqual(
      actor,
    );
    expect(
      await tickets.consume({ ticket: fresh, now: Date.now() }),
    ).toBeNull();
  } finally {
    broker.client.close();
    await cleanupResources({ testRunId: runId, resources, execute: docker });
  }
});
