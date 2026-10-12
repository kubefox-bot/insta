import { deliveryRecoveryPolicy } from "./conts";
import type {
  DeliveryMaintenance,
  DeliveryMaintenanceDependencies,
} from "./types";
/** Один outbox owner выполняет ограниченный cleanup даже без claims; deadline меняется только после полного settlement успешного turn. */
export const createDeliveryMaintenance = (
  ports: DeliveryMaintenanceDependencies,
): DeliveryMaintenance => {
  let nextRunAt = 0;
  return async ({ signal }) => {
    signal.throwIfAborted();
    const nowMs = ports.clock();
    if (nowMs < nextRunAt) return;
    await ports.journal.prune({ nowMs, signal });
    await ports.streams.retain({ nowMs, signal });
    signal.throwIfAborted();
    nextRunAt = nowMs + deliveryRecoveryPolicy.pruneIntervalMs;
  };
};
