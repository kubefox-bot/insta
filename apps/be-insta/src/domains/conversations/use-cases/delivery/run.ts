import { RealtimeErrorCode } from "@insta/contracts/realtime";
import { deliveryRetryDelay } from "../../domain/delivery/transition";
import type { DeliveryRuntimePorts } from "../../ports/delivery/types";
import { notifyDelivery } from "./notice";
import { recoverDelivery } from "./recover";
import type { DeliveryRunInput, DeliveryRunState } from "./types";
/** Владеет восстановлением/доставкой одной подписки; terminal notice никогда не возвращает её к business attempts. */
export const runDelivery = async (
  input: DeliveryRunInput,
  ports: DeliveryRuntimePorts,
) => {
  const state: DeliveryRunState = {
    position: input.prepared.baseline,
    pending: undefined,
    failures: 0,
    retries: 0,
  };
  let recoveryRetries = 0;
  while (!input.signal.aborted) {
    const outcome = await recoverDelivery(input, state, ports);
    switch (outcome) {
      case "closed":
      case "unauthorized":
        return;
      case "blocked":
      case "resync-required":
        await notifyDelivery(
          {
            ...input,
            code:
              outcome === "blocked"
                ? RealtimeErrorCode.DeliveryBlocked
                : RealtimeErrorCode.ResyncRequired,
          },
          ports,
        );
        return;
      case "recover":
        break;
      default:
        return outcome satisfies never;
    }
    await ports.wait({
      delayMs: deliveryRetryDelay({
        retries: recoveryRetries,
        random: ports.random(),
        policy: ports.policy,
      }),
      signal: input.signal,
    });
    recoveryRetries++;
  }
};
