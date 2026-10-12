import { deliveryNamespace } from "../../../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/conts";
import { createDragonflyDeliveryStreams } from "../../../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/create";
import { bootstrapGeneration } from "../../../../apps/be-insta/src/lib/dragonfly/bootstrap";
import { bootstrapDeliveryBroker } from "../bootstrap";
import { capacityDayMs, capacityEpoch, capacityStreams } from "./events";
import { fillCapacity } from "./fill";
import { authProbe, memory } from "./measure";
import { ownCapacityBroker } from "./owned-broker";
import { restoreCapacity } from "./restore";
import type { CapacityInput } from "./types";
export const runCapacity = async ({ profile, rate }: CapacityInput) => {
  await using resources = new AsyncDisposableStack();
  const auth = await ownCapacityBroker({ maxMemory: "256mb" });
  resources.defer(auth.close);
  const broker = await ownCapacityBroker({
    maxMemory: "1gb",
    containerMemoryMb: 1536,
  });
  resources.defer(broker.close);
  await bootstrapGeneration(auth.current().client);
  await bootstrapDeliveryBroker(broker.current().client);
  const authClient = auth.current().client;
  const client = broker.current().client;
  const total = rate * 86400;
  const count = total / capacityStreams[profile].length;
  const nowMs = Date.now() + capacityDayMs;
  const adapter = createDragonflyDeliveryStreams({
    client,
    namespace: deliveryNamespace,
    openReader: () => client.duplicate(),
    clock: () => nowMs,
  });
  resources.defer(adapter.close);
  const samples: unknown[] = [
    {
      phase: "before",
      ...(await memory(client)),
      auth: await authProbe(authClient),
    },
  ];
  const slots = await Promise.all(
    capacityStreams[profile].map(async (stream) => {
      const after = {
        streamId: `${stream.kind}:${stream.id}`,
        epoch: capacityEpoch,
        cursor: 0,
      };
      const lease = await adapter.acquire({ stream });
      await adapter.begin({ lease, after });
      await adapter.publishReady({
        lease,
        head: after,
        expiresAt: nowMs + capacityDayMs,
      });
      return { stream, lease, after };
    }),
  );
  const result = await fillCapacity({
    adapter,
    client,
    authClient,
    slots,
    count,
    nowMs,
  });
  samples.push(...result.samples, {
    phase: "after",
    ...(await memory(client)),
    auth: await authProbe(authClient),
  });
  if (result.oom)
    return {
      profile,
      rate,
      total,
      ...result,
      samples,
      restoreOutcome: "not-run",
    };
  await client.send("SAVE", []);
  await adapter.close();
  const restored = await broker.restart();
  const restoredAdapter = createDragonflyDeliveryStreams({
    client: restored.client,
    namespace: deliveryNamespace,
    openReader: () => restored.client.duplicate(),
    clock: () => nowMs,
  });
  resources.defer(restoredAdapter.close);
  samples.push({
    phase: "cold-before-bootstrap",
    ...(await memory(restored.client)),
    auth: await authProbe(authClient),
  });
  await bootstrapDeliveryBroker(restored.client);
  const restoreOutcome = await restoreCapacity({
    adapter: restoredAdapter,
    client: restored.client,
    authClient,
    slots,
    count,
    nowMs,
  });
  samples.push({
    phase: "restored",
    ...(await memory(restored.client)),
    auth: await authProbe(authClient),
  });
  return { profile, rate, total, ...result, samples, restoreOutcome };
};
