import { deliveryPositionSchema } from "@insta/contracts/realtime";
import {
  evaluateFenced,
  readGeneration,
} from "@insta/fe-core/dragonfly/server";
import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
import { inspectLua, readLua, streamsPolicy } from "./conts";
import { streamKeys } from "./keys";
import {
  materializedDeliverySchema,
  streamRowsSchema,
  streamStateSchema,
} from "./schema";
import type { StreamsDependencies } from "./types";
/** Проверяет весь ready range средствами Dragonfly; отсутствие живого tail не становится пустым успешным replay. */
export const inspectStream = async (
  input: Parameters<DeliveryStreams["inspect"]>[0],
  dependencies: StreamsDependencies,
): ReturnType<DeliveryStreams["inspect"]> => {
  input.signal?.throwIfAborted();
  deliveryPositionSchema.parse(input.after);
  const generation = await readGeneration({
    client: dependencies.client,
    namespace: dependencies.namespace,
  });
  const result = await evaluateFenced({
    client: dependencies.client,
    namespace: dependencies.namespace,
    generation,
    keys: streamKeys(input.after.streamId),
    arguments: [input.after.epoch],
    script: inspectLua,
  });
  if (result === null) return { kind: "gap" };
  const [epoch, base, head] = streamStateSchema.parse(result);
  return {
    kind: "ready",
    generation,
    after: { ...input.after, epoch, cursor: Number(base) },
    head: { ...input.after, epoch, cursor: Number(head) },
  };
};
/** Читает полный payload исключительно из Streams; структурная дыра или логический expiry требуют owning restore barrier. */
export const readStream = async (
  input: Parameters<DeliveryStreams["read"]>[0],
  dependencies: StreamsDependencies,
): ReturnType<DeliveryStreams["read"]> => {
  input.signal?.throwIfAborted();
  deliveryPositionSchema.parse(input.after);
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit <= 0 ||
    input.limit > streamsPolicy.maximumPageSize
  )
    throw new Error("Invalid delivery page size");
  const generation = await readGeneration({
    client: dependencies.client,
    namespace: dependencies.namespace,
  });
  const result = await evaluateFenced({
    client: dependencies.client,
    namespace: dependencies.namespace,
    generation,
    keys: streamKeys(input.after.streamId),
    arguments: [
      input.after.epoch,
      String(input.after.cursor),
      String(input.limit),
    ],
    script: readLua,
  });
  if (result === null) return { kind: "gap" };
  const [head, rows] = streamRowsSchema.parse(result);
  const events = rows.map(([id, [, json]], index) => {
    const event = materializedDeliverySchema.parse(JSON.parse(json));
    if (
      id !== `${event.cursor}-0` ||
      event.cursor !== input.after.cursor + index + 1 ||
      event.epoch !== input.after.epoch ||
      event.streamId !== input.after.streamId
    )
      throw new Error("Invalid stream delivery coordinates");
    return event;
  });
  if (
    events.length !==
      Math.min(input.limit, Number(head) - input.after.cursor) ||
    events.some((event) => event.expiresAt <= dependencies.clock())
  )
    return { kind: "gap" };
  input.signal?.throwIfAborted();
  return {
    kind: "page",
    events,
    head: { ...input.after, cursor: Number(head) },
  };
};
