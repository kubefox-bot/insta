import { Result } from "@bloodyowl/boxed";
import {
  type DeliveryPosition,
  type PreparedSubscription,
  RealtimeErrorCode,
} from "@insta/contracts/realtime";
import type {
  DeliveryAdmissionCode,
  DeliverySelection,
} from "../../ports/delivery/types";
import { activateDelivery } from "./activate";
import type { SubscriptionEntry, SubscriptionPorts } from "./types";
/** Повтор admission сохраняет прежний token/baseline только для той же команды и ещё действующего диапазона. */
export const reusePreparedDelivery = async (
  entry: SubscriptionEntry,
  selection: DeliverySelection,
  after: DeliveryPosition | undefined,
  ports: SubscriptionPorts,
): Promise<Result<PreparedSubscription, DeliveryAdmissionCode>> => {
  if (
    entry.state.kind !== "prepared" ||
    entry.mode !== (after ? "resume" : "snapshot")
  )
    return Result.Error(RealtimeErrorCode.ResyncRequired);
  const prepared = entry.state.prepared;
  if (
    after &&
    (after.cursor !== prepared.baseline.cursor ||
      after.epoch !== prepared.baseline.epoch)
  )
    return Result.Error(RealtimeErrorCode.ResyncRequired);
  const valid = await activateDelivery(
    { ...selection, ...prepared, prepared },
    ports,
  );
  return valid.isError() ? Result.Error(valid.getError()) : Result.Ok(prepared);
};
