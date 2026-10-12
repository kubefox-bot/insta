import { restoreDeliveryStream } from "../../../../apps/be-insta/src/domains/conversations/use-cases/delivery/restore";
import { capacityJournal } from "./events";
import { isOom } from "./measure";
import type { CapacityEnvironment } from "./types";
export const restoreCapacity = async (input: CapacityEnvironment) => {
  for (const slot of input.slots) {
    try {
      await restoreDeliveryStream(
        { after: slot.after },
        {
          journal: capacityJournal({
            stream: slot.stream,
            count: input.count,
            nowMs: input.nowMs,
          }),
          streams: input.adapter,
          clock: () => input.nowMs,
        },
      );
    } catch (error) {
      if (!isOom(error)) throw error;
      return "oom";
    }
  }
  return "complete";
};
