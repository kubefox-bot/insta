import {
  type DeliveryNotice,
  realtimeKinds,
  realtimeProtocolVersion,
} from "@insta/contracts/realtime";
import { deliveryRetryDelay } from "../../domain/delivery/transition";
import type { DeliveryRuntimePorts } from "../../ports/delivery/types";
import { authorizeDelivery } from "./authorize";
import type { DeliveryRunInput } from "./types";
/** Повторяет только terminal notice до установки состояния клиентом; business cursor остаётся прежним. */
export const notifyDelivery = async (
  input: DeliveryRunInput & Readonly<{ code: DeliveryNotice["code"] }>,
  ports: DeliveryRuntimePorts,
) => {
  const notice: DeliveryNotice = {
    version: realtimeProtocolVersion,
    kind: realtimeKinds.deliveryNotice,
    subscriptionId: input.prepared.subscriptionId,
    streamId: input.prepared.baseline.streamId,
    epoch: input.prepared.baseline.epoch,
    code: input.code,
  };
  let retries = 0;
  while (!input.signal.aborted) {
    try {
      const access = await authorizeDelivery(input, ports);
      if (access.isError()) return;
      const result = await ports.target.notify({
        notice,
        signal: input.signal,
      });
      if (result !== "retry") return;
    } catch {
      if (input.signal.aborted) return;
    }
    await ports.wait({
      delayMs: deliveryRetryDelay({
        retries,
        random: ports.random(),
        policy: ports.policy,
      }),
      signal: input.signal,
    });
    retries++;
  }
};
