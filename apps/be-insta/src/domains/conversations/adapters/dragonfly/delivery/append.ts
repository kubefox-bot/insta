import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
import { appendLua } from "./conts";
import { materializedDeliverySchema } from "./schema";
import type { StreamsDependencies } from "./types";
import { writeStream } from "./write";
/** XADD и продвижение tail выполняются под fence; повтор сравнивает точный immutable payload, ready отдельно. */
export const appendDelivery = async (
  input: Parameters<DeliveryStreams["append"]>[0],
  dependencies: StreamsDependencies,
): ReturnType<DeliveryStreams["append"]> => {
  const event = materializedDeliverySchema.parse(input.event);
  if (event.streamId !== `${input.lease.stream.kind}:${input.lease.stream.id}`)
    throw new Error("Foreign delivery stream");
  const result = await writeStream(
    {
      ...input,
      script: appendLua,
      args: [event.epoch, String(event.cursor), JSON.stringify(event)],
    },
    dependencies,
  );
  if (result !== "appended" && result !== "duplicate" && result !== "gap")
    throw new Error("Invalid stream append result");
  return result;
};
