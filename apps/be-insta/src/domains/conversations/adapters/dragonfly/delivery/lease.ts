import { setTimeout as delay } from "node:timers/promises";
import {
  evaluateFenced,
  readGeneration,
} from "@insta/fe-core/dragonfly/server";
import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
import type { DeliveryLease } from "../../../ports/delivery/types";
import { streamsPolicy } from "./conts";
import { streamKeys } from "./keys";
import type { StreamsDependencies } from "./types";
/** Арендует stream с физическим fence; ожидание конкурента отменяемо и не занимает browser ACK. */
export const acquireLease = async (
  input: Parameters<DeliveryStreams["acquire"]>[0],
  dependencies: StreamsDependencies,
): Promise<DeliveryLease> => {
  const token = crypto.randomUUID();
  const streamId = `${input.stream.kind}:${input.stream.id}`;
  for (;;) {
    input.signal?.throwIfAborted();
    const generation = await readGeneration({
      client: dependencies.client,
      namespace: dependencies.namespace,
    });
    const acquired = await evaluateFenced({
      client: dependencies.client,
      namespace: dependencies.namespace,
      generation,
      keys: streamKeys(streamId),
      arguments: [token, String(streamsPolicy.leaseMs)],
      script: "return redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3],'NX')",
    });
    if (acquired === "OK") return { stream: input.stream, generation, token };
    await delay(streamsPolicy.leaseRetryMs, undefined, {
      signal: input.signal,
    });
  }
};
/** Освобождает только собственную аренду; устаревшая generation не затрагивает новую. */
export const releaseLease = async (
  { lease }: Parameters<DeliveryStreams["release"]>[0],
  dependencies: StreamsDependencies,
) => {
  await evaluateFenced({
    client: dependencies.client,
    namespace: dependencies.namespace,
    generation: lease.generation,
    keys: streamKeys(`${lease.stream.kind}:${lease.stream.id}`),
    arguments: [lease.token],
    script:
      "if redis.call('GET',KEYS[2])==ARGV[2] then return redis.call('DEL',KEYS[2]) end return 0",
  });
};
