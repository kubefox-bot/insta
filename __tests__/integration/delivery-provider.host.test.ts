import { expect, test } from "bun:test";
import { readGeneration } from "@insta/fe-core/dragonfly/server";
import { deliveryStreamsNamespace } from "../../apps/be-insta/src/domains/conversations/server/index";
import * as brokerApi from "../../apps/be-insta/src/lib/dragonfly/index";
import { withDeliveryBroker } from "../fixtures/delivery/broker";

test("delivery bootstrap preserves auth namespace and is idempotent for the live process", async () => {
  expect(typeof brokerApi.bootstrapNamespaceGeneration).toBe("function");
  await withDeliveryBroker(async ({ client }) => {
    await client.set("infra:auth-generation", "sentinel-auth");
    await client.del("infra:delivery-generation");
    await brokerApi.bootstrapNamespaceGeneration({
      client,
      namespace: deliveryStreamsNamespace,
    });
    const generation = await readGeneration({
      client,
      namespace: deliveryStreamsNamespace,
    });
    await brokerApi.bootstrapNamespaceGeneration({
      client,
      namespace: deliveryStreamsNamespace,
    });
    expect(
      await readGeneration({ client, namespace: deliveryStreamsNamespace }),
    ).toBe(generation);
    expect(await client.get("infra:auth-generation")).toBe("sentinel-auth");
  });
}, 30000);

test("delivery degradation keeps required admission ready and does not close a borrowed provider", async () => {
  const { createInfrastructureReadiness } = await import(
    "../../apps/be-insta/src/app/health/readiness/index"
  );
  const { RedisClient } = await import("bun");
  await withDeliveryBroker(async ({ client, url }) => {
    await brokerApi.bootstrapGeneration(client);
    const readiness = createInfrastructureReadiness({
      database: { apiDb: { command: async () => ({ ok: 1 }) } },
      broker: client,
      timeoutMs: 1000,
      mailpitUrl: "http://127.0.0.1:1",
      mailStatus: () => "degraded",
      deliveryProbe: {
        authIdentity: "0".repeat(40),
        open: () =>
          new RedisClient(url, {
            autoReconnect: false,
            connectionTimeout: 100,
          }),
        namespace: deliveryStreamsNamespace,
        timeoutMs: 100,
      },
    });
    expect(await readiness.check()).toMatchObject({
      ready: true,
      delivery: "ok",
    });
    await client.del("infra:delivery-generation");
    expect(await readiness.check()).toMatchObject({
      ready: true,
      delivery: "degraded",
    });
    expect(await readiness.checkRequired()).toBe(true);
    expect(await client.send("PING", [])).toBe("PONG");
  });
}, 30000);

test("delivery command connection recovers after repeated bounded outage attempts without replaying offline writes", async () => {
  expect(typeof brokerApi.createDeliveryConnection).toBe("function");
  const { docker } = await import("../fixtures/docker");
  const { waitUntil } = await import("../fixtures/barrier");
  await withDeliveryBroker(async ({ url, name }) => {
    const provider = brokerApi.createDeliveryConnection({
      config: { url, timeoutMs: 100 },
      authIdentity: "0".repeat(40),
    });
    const client = provider.client;
    try {
      await docker("pause", name);
      await expect(
        client.send("SET", ["must-not-replay", "yes"]),
      ).rejects.toThrow();
      for (let attempt = 0; attempt < 3; attempt++)
        await expect(client.send("PING", [])).rejects.toThrow();
      await docker("unpause", name);
      await waitUntil({
        check: () =>
          client.send("PING", []).then(
            (v) => v === "PONG",
            () => false,
          ),
      });
      expect(await client.get("must-not-replay")).toBeNull();
      await brokerApi.bootstrapNamespaceGeneration({
        client,
        namespace: deliveryStreamsNamespace,
      });
      expect(
        await readGeneration({ client, namespace: deliveryStreamsNamespace }),
      ).toBeString();
    } finally {
      await provider.close();
    }
  });
}, 30000);

test("different endpoint aliases cannot designate the same physical auth broker", async () => {
  await withDeliveryBroker(async ({ client, url }) => {
    const alias = new URL(url);
    alias.hostname = "localhost";
    const authIdentity = await brokerApi.readBrokerIdentity(client);
    const delivery = brokerApi.createDeliveryConnection({
      config: { url: alias.href, timeoutMs: 1000 },
      authIdentity,
    });
    try {
      await expect(
        delivery.client.send("SET", ["alias-must-not-write", "yes"]),
      ).rejects.toThrow();
      expect(await client.get("alias-must-not-write")).toBeNull();
    } finally {
      await delivery.close();
    }
  });
}, 30000);

test("delivery close cancels a blocked owned command and waits its settlement", async () => {
  const { waitUntil } = await import("../fixtures/barrier");
  await withDeliveryBroker(async ({ client: observer, url }) => {
    const provider = brokerApi.createDeliveryConnection({
      config: { url, timeoutMs: 10000 },
      authIdentity: "0".repeat(40),
    });
    const id = await provider.client.send("CLIENT", ["ID"]);
    const operation = provider.client
      .send("XREAD", ["BLOCK", "0", "STREAMS", "close-test", "$"])
      .then(
        () => "resolved",
        () => "cancelled",
      );
    await waitUntil({
      check: async () =>
        String(await observer.send("CLIENT", ["LIST"]))
          .split("\n")
          .some(
            (line) =>
              line.startsWith("id=" + id + " ") && / flags=[a-z]*b/.test(line),
          ),
    });
    const started = Date.now();
    await provider.close();
    expect(Date.now() - started).toBeLessThan(3000);
    expect(await operation).toBe("cancelled");
    await expect(provider.client.send("PING", [])).rejects.toThrow("closed");
    expect(await observer.send("PING", [])).toBe("PONG");
  });
}, 30000);

test("delivery health timeout closes only the probe and settles before returning", async () => {
  const { RedisClient } = await import("bun");
  const { docker } = await import("../fixtures/docker");
  const { checkDeliveryReadiness } = await import(
    "../../apps/be-insta/src/app/health/readiness/probes/delivery"
  );
  await withDeliveryBroker(async ({ client, url, name }) => {
    await docker("pause", name);
    try {
      const started = Date.now();
      expect(
        await checkDeliveryReadiness({
          authIdentity: "0".repeat(40),
          namespace: deliveryStreamsNamespace,
          timeoutMs: 100,
          open: () =>
            new RedisClient(url, {
              autoReconnect: false,
              enableOfflineQueue: false,
              connectionTimeout: 100,
            }),
        }),
      ).toBe("degraded");
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      await docker("unpause", name);
    }
    expect(await client.send("PING", [])).toBe("PONG");
  });
}, 30000);
