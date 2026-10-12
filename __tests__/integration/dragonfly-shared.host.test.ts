import { expect, test } from "bun:test";
import type { DragonflyCommands } from "@insta/fe-core/dragonfly/server";
import { evaluateFenced } from "../../apps/be-insta/src/lib/dragonfly/generation";
import { createDragonflyIntents } from "../../apps/fe-insta/src/domains/auth-continuation/server/index";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { docker } from "../fixtures/docker";
import { startBroker } from "../fixtures/isolated-broker";

test("shared fence preserves FE/BE identity validation and refuses stale mutations atomically", async () => {
  const name = `insta-fnd04-${crypto.randomUUID()}`;
  await docker("volume", "create", "--label", `insta.testRunId=${name}`, name);
  const resources: OwnedResource[] = [{ kind: "volume", id: name }];
  try {
    const { client } = await startBroker(name, resources);
    try {
      for (const identity of ["a", "a".repeat(40)]) {
        // Only this test-owned broker rewrites INFO inside Lua to exercise malformed identities.
        const simulated: DragonflyCommands = {
          get: (key) => client.get(key),
          send: (command, args) =>
            client.send(command, [
              `local original = redis.call; local redis = {error_reply = redis.error_reply, call = function(cmd, ...) if cmd == 'INFO' then return 'master_replid:${identity}' end return original(cmd, ...) end};\n${args[0]}`,
              ...args.slice(1),
            ]),
        };
        const generation = identity;
        await client.set("infra:auth-generation", generation);
        const id = crypto.randomUUID();
        const intent = {
          type: "compose_message" as const,
          operationId: crypto.randomUUID(),
          intentId: id,
          context: "test",
          createdAt: Date.now(),
          expiresAt: Date.now() + 60000,
          state: "pending" as const,
        };
        const intents = createDragonflyIntents({
          client: simulated,
          generation,
        });
        expect(await intents.create(intent)).toBe(true);
        const mutation = () =>
          evaluateFenced({
            client: simulated,
            generation,
            keys: ["probe"],
            script: "return redis.call('SET',KEYS[2],'changed')",
          });
        if (identity.length === 40) expect(await mutation()).toBe("OK");
        else {
          await expect(mutation()).rejects.toThrow(
            "BROKER_IDENTITY_UNAVAILABLE",
          );
          expect(await client.get(`auth:${generation}:probe`)).toBeNull();
        }
        if (identity.length === 40) {
          await client.del(`auth:${generation}:probe`);
          await client.set("infra:auth-generation", `${identity}:rotated`);
          await expect(mutation()).rejects.toThrow("BROKER_GENERATION_STALE");
          await expect(
            intents.compare({
              previous: intent,
              next: { ...intent, state: "consumed" },
            }),
          ).rejects.toThrow("INTENT_GENERATION_UNAVAILABLE");
          expect(await client.get(`auth:${generation}:probe`)).toBeNull();
          await client.del("infra:auth-generation");
          await expect(mutation()).rejects.toThrow("BROKER_NOT_BOOTSTRAPPED");
          await expect(
            intents.compare({
              previous: intent,
              next: { ...intent, state: "consumed" },
            }),
          ).rejects.toThrow("INTENT_GENERATION_UNAVAILABLE");
          expect(await client.get(`auth:${generation}:probe`)).toBeNull();
        }
        await client.set(
          "infra:auth-generation",
          `${"b".repeat(40)}:restarted`,
        );
        await expect(
          intents.compare({
            previous: intent,
            next: { ...intent, state: "consumed" },
          }),
        ).rejects.toThrow("INTENT_GENERATION_UNAVAILABLE");
        expect(
          JSON.parse(
            (await client.get(`auth:${generation}:continuation:${id}`)) ??
              "null",
          ).state,
        ).toBe("pending");
      }
    } finally {
      client.close();
    }
  } finally {
    await cleanupResources({ testRunId: name, resources, execute: docker });
  }
}, 60000);
