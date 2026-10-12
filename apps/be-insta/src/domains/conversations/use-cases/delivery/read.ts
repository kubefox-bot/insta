import type { DeliveryRuntimePorts } from "../../ports/delivery/types";
import { createDeliveryAttempt } from "./attempt";
import type { DeliveryRunInput, DeliveryRunState } from "./types";
/** Сохраняет прежнюю in-flight единицу либо читает следующий bounded contiguous batch. */
export const readDeliveryAttempt = async (
  input: DeliveryRunInput,
  state: DeliveryRunState,
  ports: DeliveryRuntimePorts,
) => {
  if (state.pending) return "ready" as const;
  const page = await ports.streams.read({
    after: state.position,
    limit: ports.policy.replayPageSize,
    signal: input.signal,
  });
  if (page.kind === "gap") return "recover" as const;
  state.pending = createDeliveryAttempt({
    events: page.events,
    after: state.position,
    subscriptionId: input.prepared.subscriptionId,
    limit: ports.policy.maxUnreadBatchSize,
    unread: input.target.kind === "unread",
  });
  return state.pending ? ("ready" as const) : ("empty" as const);
};
