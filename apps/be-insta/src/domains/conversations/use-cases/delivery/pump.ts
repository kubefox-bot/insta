import type { DeliveryRuntimePorts } from "../../ports/delivery/types";
import { advanceDelivery } from "./advance";
import { listenDelivery } from "./listen";
import { readDeliveryAttempt } from "./read";
import type { DeliveryRunInput, DeliveryRunState } from "./types";
/** Читает replay/live одним owned watcher и отправляет одну in-flight единицу на подписку. */
export const pumpDelivery = async (
  input: DeliveryRunInput,
  state: DeliveryRunState,
  ports: DeliveryRuntimePorts,
): Promise<
  "recover" | "blocked" | "resync-required" | "closed" | "unauthorized"
> => {
  const listener = listenDelivery({ ...input, after: state.position }, ports);
  try {
    while (!input.signal.aborted) {
      if (listener.needsRecovery()) return "recover";
      listener.reading();
      const next = await readDeliveryAttempt(input, state, ports);
      switch (next) {
        case "recover":
          return next;
        case "empty":
          await listener.wait();
          continue;
        case "ready":
          break;
        default:
          return next satisfies never;
      }
      const outcome = await advanceDelivery(input, state, ports);
      if (outcome !== "continue") return outcome;
    }
    return "closed";
  } finally {
    await listener.close();
  }
};
