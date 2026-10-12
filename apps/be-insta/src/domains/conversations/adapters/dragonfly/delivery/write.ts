import { evaluateFenced } from "@insta/fe-core/dragonfly/server";
import type { DeliveryLease } from "../../../ports/delivery/types";
import { streamsPolicy } from "./conts";
import { streamKeys } from "./keys";
import type { StreamsDependencies } from "./types";
/** Выполняет одну запись с lease/physical fence и ждёт провайдер даже при отмене вызывающего сценария. */
export const writeStream = async (
  {
    lease,
    script,
    args,
    signal,
  }: Readonly<{
    lease: DeliveryLease;
    script: string;
    args: readonly string[];
    signal?: AbortSignal;
  }>,
  dependencies: StreamsDependencies,
) => {
  signal?.throwIfAborted();
  const result = await evaluateFenced({
    client: dependencies.client,
    namespace: dependencies.namespace,
    generation: lease.generation,
    keys: streamKeys(`${lease.stream.kind}:${lease.stream.id}`),
    arguments: [lease.token, String(streamsPolicy.leaseMs), ...args],
    script,
  });
  signal?.throwIfAborted();
  return result;
};
