import type { DeliveryStep } from "../../domain/delivery/types";
import type {
  DeliveryInFlight,
  DeliverySendPorts,
} from "../../ports/delivery/types";
import { acknowledgeDelivery } from "./acknowledge";
import { authorizeDelivery } from "./authorize";
import { authorizeUnreadAttempt } from "./authorize-unread";
/** Выполняет одну попытку immutable delivery; caller владеет последовательностью, timer и cursor. */
export const deliverNext = async (
  {
    subscription,
    signal,
  }: Readonly<{ subscription: DeliveryInFlight; signal: AbortSignal }>,
  ports: DeliverySendPorts,
): Promise<DeliveryStep> => {
  if (signal.aborted) return { kind: "closed" };
  const access = await authorizeDelivery({ ...subscription, signal }, ports);
  if (access.isError()) return { kind: "unauthorized" };
  if (!(await authorizeUnreadAttempt(subscription, signal, ports)))
    return { kind: "resync-required" };
  if (ports.clock() >= subscription.attempt.expiresAt)
    return { kind: "resync-required" };
  const reply = await ports.target.send({
    unit: subscription.attempt.unit,
    signal,
  });
  return acknowledgeDelivery({
    ...subscription,
    ...subscription.attempt,
    reply,
    nowMs: ports.clock(),
    random: ports.random(),
    policy: ports.policy,
    signal,
  });
};
