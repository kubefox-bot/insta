import { deliveryPositionSchema } from "@insta/contracts/realtime";
import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
import { beginLua, readyLua, streamsPolicy } from "./conts";
import type { StreamsDependencies } from "./types";
import { writeStream } from "./write";
/** Применяет только доказанный Mongo floor: точный MINID trim; повреждённый диапазон становится неготовым до полного restore. */
export const beginRestore = async (
  input: Parameters<DeliveryStreams["begin"]>[0],
  dependencies: StreamsDependencies,
) => {
  deliveryPositionSchema.parse(input.after);
  if (
    input.after.streamId !==
    `${input.lease.stream.kind}:${input.lease.stream.id}`
  )
    throw new Error("Foreign delivery range");
  const cursor = Number(
    await writeStream(
      {
        ...input,
        script: beginLua,
        args: [input.after.epoch, String(input.after.cursor)],
      },
      dependencies,
    ),
  );
  if (!Number.isSafeInteger(cursor) || cursor < input.after.cursor)
    throw new Error("Invalid restore cursor");
  return { ...input.after, cursor };
};
/** Публикует ready только после проверки физического непрерывного диапазона; TTL убирает idle keys после исходного expiry. */
export const publishReady = async (
  input: Parameters<DeliveryStreams["publishReady"]>[0],
  dependencies: StreamsDependencies,
) => {
  deliveryPositionSchema.parse(input.head);
  if (
    input.head.streamId !==
      `${input.lease.stream.kind}:${input.lease.stream.id}` ||
    !Number.isSafeInteger(input.expiresAt)
  )
    throw new Error("Invalid ready publication");
  const idleExpiry = Math.max(
    input.expiresAt,
    dependencies.clock() + streamsPolicy.idleGraceMs,
  );
  await writeStream(
    {
      ...input,
      script: readyLua,
      args: [input.head.epoch, String(input.head.cursor), String(idleExpiry)],
    },
    dependencies,
  );
};
