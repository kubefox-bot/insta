import { expect, test } from "bun:test";
import { incrementWindow } from "../../../apps/be-insta/src/lib/dragonfly/quota/increment";
import { createDragonflyIntents } from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";

test("quota validates provider reply and exposes remaining TTL without extending it", async () => {
  const client = { get: async () => null, send: async () => [2, 1234] };
  expect(
    await incrementWindow({
      client,
      generation: "g",
      key: "owner:key",
      windowMs: 60000,
    }),
  ).toEqual({ count: 2, ttlMs: 1234 });
  const broken = { ...client, send: async () => [2, -1] };
  await expect(
    incrementWindow({
      client: broken,
      generation: "g",
      key: "owner:key",
      windowMs: 60000,
    }),
  ).rejects.toThrow();
});
for (const message of [
  "BROKER_IDENTITY_UNAVAILABLE",
  "BROKER_NOT_BOOTSTRAPPED",
  "BROKER_GENERATION_STALE",
  "network failure",
])
  test(`FE maps only protocol error ${message}`, async () => {
    const client = {
      get: async () => null,
      send: async () => {
        throw new Error(message);
      },
    };
    const intents = createDragonflyIntents({ client, generation: "g" });
    await expect(intents.find(crypto.randomUUID())).rejects.toThrow(
      message.startsWith("BROKER_")
        ? "INTENT_GENERATION_UNAVAILABLE"
        : "network failure",
    );
  });
