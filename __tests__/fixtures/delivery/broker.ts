import { deliveryNamespace } from "../../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/conts";
import { createDragonflyDeliveryStreams } from "../../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/create";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { docker } from "../docker";
import { startBroker } from "../isolated-broker";
import { bootstrapDeliveryBroker } from "./bootstrap";
export const withDeliveryBroker = async (
  run: (
    environment: Awaited<ReturnType<typeof startBroker>> &
      Readonly<{
        streams: ReturnType<typeof createDragonflyDeliveryStreams>;
        name: string;
      }>,
  ) => Promise<void>,
) => {
  const name = `insta-chat03-${crypto.randomUUID()}`;
  await docker("volume", "create", "--label", `insta.testRunId=${name}`, name);
  const resources: OwnedResource[] = [{ kind: "volume", id: name }];
  try {
    const environment = await startBroker(name, resources);
    await bootstrapDeliveryBroker(environment.client);
    const streams = createDragonflyDeliveryStreams({
      namespace: deliveryNamespace,
      client: environment.client,
      openReader: () => environment.client.duplicate(),
      clock: Date.now,
    });
    try {
      await run({ ...environment, streams, name });
    } finally {
      await streams.close();
      environment.client.close();
    }
  } finally {
    await cleanupResources({ testRunId: name, resources, execute: docker });
  }
};
export const stream = { kind: "conversation", id: "one" } as const;
export const baseline = {
  streamId: "conversation:one",
  epoch: "00000000-0000-4000-8000-000000000001",
  cursor: 0,
} as const;
export const delivery = (cursor: number) => {
  const eventId = `00000000-0000-4000-8000-${String(cursor).padStart(12, "0")}`;
  return {
    ...baseline,
    cursor,
    eventId,
    eventType: "conversations.unread.changed",
    source: { kind: "message", eventId },
    createdAt: 100,
    recordedAt: 100,
    expiresAt: Date.now() + 86400000,
    payload: {
      version: 1,
      kind: "event",
      type: "conversations.unread.changed",
      eventId,
      occurredAt: "2026-10-20T00:00:00.000Z",
      meta: { requestId: eventId },
      data: { conversationId: "one" },
    },
  } as const;
};
