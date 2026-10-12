import { Result } from "@bloodyowl/boxed";
import type {
  DeliveryPosition,
  PreparedSubscription,
} from "@insta/contracts/realtime";
import type {
  DeliveryAdmissionCode,
  DeliveryAdmissionPorts,
  DeliverySelection,
} from "../../ports/delivery/types";
import { authorizeDelivery } from "./authorize";
import { validateDeliveryPosition } from "./validate-position";
/** Создаёт новый token для проверенной resume позиции; restore принадлежит активированному lifetime. */
export const resumeDelivery = async (
  input: DeliverySelection & Readonly<{ after: DeliveryPosition }>,
  ports: DeliveryAdmissionPorts,
): Promise<Result<PreparedSubscription, DeliveryAdmissionCode>> => {
  const access = await authorizeDelivery(input, ports);
  if (access.isError()) return Result.Error(access.getError());
  const position = await validateDeliveryPosition(input, ports);
  if (position.isError()) return Result.Error(position.getError());
  return Result.Ok({ subscriptionId: ports.uuid(), baseline: input.after });
};
