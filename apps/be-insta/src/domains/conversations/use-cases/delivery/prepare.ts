import { Result } from "@bloodyowl/boxed";
import type { PreparedSubscription } from "@insta/contracts/realtime";
import type {
  DeliveryAdmissionCode,
  DeliveryAdmissionPorts,
  DeliverySelection,
} from "../../ports/delivery/types";
import { authorizeDelivery } from "./authorize";
/** Выдаёт majority baseline после авторизации; reservation принадлежит вызывающему owner, Streams ещё не читаются. */
export const prepareDelivery = async (
  input: DeliverySelection,
  ports: DeliveryAdmissionPorts,
): Promise<Result<PreparedSubscription, DeliveryAdmissionCode>> => {
  const access = await authorizeDelivery(input, ports);
  if (access.isError()) return Result.Error(access.getError());
  const baseline = await ports.journal.head({
    stream: input.target,
    signal: input.signal,
  });
  input.signal.throwIfAborted();
  return Result.Ok({ subscriptionId: ports.uuid(), baseline });
};
