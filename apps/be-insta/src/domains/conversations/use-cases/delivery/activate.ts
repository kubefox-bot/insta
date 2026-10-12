import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import {
  type PreparedSubscription,
  RealtimeErrorCode,
} from "@insta/contracts/realtime";
import type {
  DeliveryAdmissionCode,
  DeliveryAdmissionPorts,
  DeliverySelection,
} from "../../ports/delivery/types";
import { authorizeDelivery } from "./authorize";
import { validateDeliveryPosition } from "./validate-position";
/** Принимает только выданный token/baseline и заново проверяет retention; ACK означает установленный lifecycle, не окончание restore. */
export const activateDelivery = async (
  input: DeliverySelection &
    PreparedSubscription &
    Readonly<{ prepared: PreparedSubscription }>,
  ports: DeliveryAdmissionPorts,
): Promise<Result<void, DeliveryAdmissionCode>> => {
  if (input.subscriptionId !== input.prepared.subscriptionId)
    return Result.Error(CommonErrorCode.Forbidden);
  const expected = input.prepared.baseline;
  if (
    input.baseline.streamId !== expected.streamId ||
    input.baseline.epoch !== expected.epoch ||
    input.baseline.cursor !== expected.cursor
  )
    return Result.Error(RealtimeErrorCode.ResyncRequired);
  const access = await authorizeDelivery(input, ports);
  if (access.isError()) return Result.Error(access.getError());
  return validateDeliveryPosition({ ...input, after: input.baseline }, ports);
};
