import type { DeliveryStreams } from "../../../apps/be-insta/src/domains/conversations/ports/delivery/interfaces";
import { baseline, delivery } from "./broker";
/** Создаёт настоящий bounded stream через production lease/append/ready, возвращая только fixture coordinates. */
export const seedRetentionStream = async ({
  streams,
  id = "one",
  count = 2,
  expiresAt,
  ready = true,
}: Readonly<{
  streams: DeliveryStreams;
  id?: string;
  count?: number;
  expiresAt: (cursor: number) => number;
  ready?: boolean;
}>) => {
  const stream = { kind: "conversation" as const, id };
  const after = { ...baseline, streamId: `conversation:${id}` };
  const lease = await streams.acquire({ stream });
  try {
    await streams.begin({ lease, after });
    for (let cursor = 1; cursor <= count; cursor += 1)
      await streams.append({
        lease,
        event: {
          ...delivery(cursor),
          streamId: after.streamId,
          expiresAt: expiresAt(cursor),
        },
      });
    if (ready)
      await streams.publishReady({
        lease,
        head: { ...after, cursor: count },
        expiresAt: expiresAt(count),
      });
  } finally {
    await streams.release({ lease });
  }
  return {
    stream,
    after,
    generation: lease.generation,
    prefix: `conversations:delivery:${lease.generation}:conversation:${id}`,
  };
};
