import { evaluateFenced } from "@insta/fe-core/dragonfly/server";
import type {
  DeliveryLease,
  DeliveryStream,
} from "../../../ports/delivery/types";
import { streamsPolicy } from "./conts";
import { streamKeys } from "./keys";
import type { StreamsDependencies } from "./types";
/** Делает одну попытку: занятый stream пропускается, ошибка провайдера остаётся ошибкой maintenance. */
export const tryRetentionLease = async (
  input: Readonly<{
    stream: DeliveryStream;
    generation: string;
    signal?: AbortSignal;
  }>,
  dependencies: StreamsDependencies,
): Promise<DeliveryLease | null> => {
  input.signal?.throwIfAborted();
  const token = crypto.randomUUID();
  const acquired = await evaluateFenced({
    client: dependencies.client,
    namespace: dependencies.namespace,
    generation: input.generation,
    keys: streamKeys(`${input.stream.kind}:${input.stream.id}`),
    arguments: [token, String(streamsPolicy.leaseMs)],
    script: "return redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3],'NX')",
  });
  // После успешного SET ресурс должен вернуться владельцу даже при отмене, чтобы finally освободил его.
  if (acquired === "OK")
    return { stream: input.stream, generation: input.generation, token };
  if (acquired === null) return null;
  throw new Error("Invalid retention lease response");
};
