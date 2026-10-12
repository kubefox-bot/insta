import type { DeliveryRuntimePorts } from "../../ports/delivery/types";
import { authorizeDelivery } from "./authorize";
import { pumpDelivery } from "./pump";
import type { DeliveryRunInput, DeliveryRunState } from "./types";
/** Provider failures остаются retryable; отказ доступа завершает только текущую подписку. */
export const recoverDelivery = async (
  input: DeliveryRunInput,
  state: DeliveryRunState,
  ports: DeliveryRuntimePorts,
) => {
  try {
    const access = await authorizeDelivery(input, ports);
    if (access.isError()) return "unauthorized" as const;
    const recovery = await ports.recover({
      after: state.position,
      signal: input.signal,
    });
    return recovery === "resync-required"
      ? ("resync-required" as const)
      : await pumpDelivery(input, state, ports);
  } catch {
    return input.signal.aborted ? ("closed" as const) : ("recover" as const);
  }
};
