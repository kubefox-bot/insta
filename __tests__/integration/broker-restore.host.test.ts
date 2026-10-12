import { expect, test } from "bun:test";
import { RedisClient } from "bun";
import { deliveryNamespace } from "../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/conts";
import { bootstrapGeneration } from "../../apps/be-insta/src/lib/dragonfly/bootstrap";
import {
  evaluateFenced,
  readGeneration,
} from "../../apps/be-insta/src/lib/dragonfly/index";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { bootstrapDeliveryBroker } from "../fixtures/delivery/bootstrap";
import { docker } from "../fixtures/docker";
import { startBroker } from "../fixtures/isolated-broker";

test("cold_restore_cannot_reuse_consumed_auth before or after generation bootstrap", async () => {
  const name = `insta-fnd04-${crypto.randomUUID()}`;
  await docker("volume", "create", "--label", `insta.testRunId=${name}`, name);
  const resources: OwnedResource[] = [{ kind: "volume", id: name }];
  try {
    const { client, url } = await startBroker(name, resources);
    try {
      await expect(readGeneration(client)).rejects.toThrow(
        "BROKER_NOT_BOOTSTRAPPED",
      );
      await bootstrapGeneration(client);
      const old = await readGeneration(client);
      for (const key of ["challenge", "ticket", "intent", "consent"])
        await evaluateFenced({
          client,
          generation: old,
          keys: [key],
          script: "return redis.call('SET', KEYS[2], 'pending')",
        });
      expect(await client.send("SAVE", [])).toBe("OK");
      for (const key of ["challenge", "ticket", "intent", "consent"])
        expect(
          await evaluateFenced({
            client,
            generation: old,
            keys: [key],
            script: "return redis.call('DEL', KEYS[2])",
          }),
        ).toBe(1);
      const other = new RedisClient(url, { autoReconnect: false });
      try {
        expect(await readGeneration(other)).toBe(old);
      } finally {
        other.close();
      }
      await docker("kill", "--signal", "KILL", name);
      client.close();
      await docker("rm", name);
      resources.pop();
      const { client: restored } = await startBroker(name, resources);
      try {
        expect(await restored.get(`auth:${old}:challenge`)).toBe("pending");
        await expect(readGeneration(restored)).rejects.toThrow(
          "BROKER_NOT_BOOTSTRAPPED",
        );
        await expect(
          evaluateFenced({
            client: restored,
            generation: old,
            keys: ["challenge"],
            script: "return redis.call('GETDEL', KEYS[2])",
          }),
        ).rejects.toThrow("BROKER_NOT_BOOTSTRAPPED");
        await bootstrapGeneration(restored);
        const current = await readGeneration(restored);
        expect(current).not.toBe(old);
        expect(
          await evaluateFenced({
            client: restored,
            generation: current,
            keys: ["challenge"],
            script: "return redis.call('GET', KEYS[2])",
          }),
        ).toBeNull();
        for (const key of ["challenge", "ticket", "intent", "consent"])
          await expect(
            evaluateFenced({
              client: restored,
              generation: old,
              keys: [key],
              script: "return redis.call('GETDEL', KEYS[2])",
            }),
          ).rejects.toThrow("BROKER_GENERATION_STALE");
        expect(await restored.get(`auth:${old}:challenge`)).toBe("pending");
        await bootstrapGeneration(restored);
        expect(await readGeneration(restored)).toBe(current);
      } finally {
        restored.close();
      }
    } finally {
      client.close();
    }
  } finally {
    await cleanupResources({ testRunId: name, resources, execute: docker });
  }
}, 60000);

import { createDragonflyDeliveryStreams } from "../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/create";
import { restoreDeliveryStream } from "../../apps/be-insta/src/domains/conversations/use-cases/delivery/restore";
import { baseline, delivery, stream } from "../fixtures/delivery/broker";
import { retainedJournal } from "../fixtures/delivery/journal";

test("three cold generations reclaim only obsolete delivery cache while preserving current/auth/unknown keys", async () => {
  const name = `insta-chat03-${crypto.randomUUID()}`;
  await docker("volume", "create", "--label", `insta.testRunId=${name}`, name);
  const resources: OwnedResource[] = [{ kind: "volume", id: name }];
  let broker = await startBroker(name, resources);
  const rows = [delivery(1), delivery(2)];
  const journal = retainedJournal(rows);
  try {
    await bootstrapDeliveryBroker(broker.client);
    await broker.client.send("SET", ["auth:protected", "synthetic"]);
    await broker.client.send("SET", [
      "conversations:delivery:unknown:keep",
      "synthetic",
    ]);
    for (let generation = 0; generation < 3; generation += 1) {
      await bootstrapDeliveryBroker(broker.client);
      const adapter = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        client: broker.client,
        openReader: () => broker.client.duplicate(),
        clock: Date.now,
      });
      try {
        expect(
          await restoreDeliveryStream(
            { after: baseline },
            { journal, streams: adapter, clock: Date.now },
          ),
        ).toEqual({ ...baseline, cursor: 2 });
        const keys = await broker.client.send("KEYS", [
          "conversations:delivery:*:entries",
        ]);
        expect(keys).toHaveLength(1);
        expect(await broker.client.get("auth:protected")).toBe("synthetic");
        expect(
          await broker.client.get("conversations:delivery:unknown:keep"),
        ).toBe("synthetic");
        const lease = await adapter.acquire({ stream });
        await broker.client.send("SAVE", []);
        if (generation === 2) {
          await adapter.release({ lease });
          continue;
        }
        broker.client.close();
        await docker("kill", "--signal", "KILL", name);
        await docker("rm", name);
        resources.pop();
        broker = await startBroker(name, resources);
        await bootstrapDeliveryBroker(broker.client);
        const stale = createDragonflyDeliveryStreams({
          namespace: deliveryNamespace,
          client: broker.client,
          openReader: () => broker.client.duplicate(),
          clock: Date.now,
        });
        try {
          await expect(
            stale.append({ lease, event: delivery(3) }),
          ).rejects.toThrow("BROKER_GENERATION_STALE");
        } finally {
          await stale.close();
        }
      } finally {
        await adapter.close();
      }
    }
  } finally {
    broker.client.close();
    await cleanupResources({ testRunId: name, resources, execute: docker });
  }
}, 60000);
