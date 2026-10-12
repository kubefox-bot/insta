import { readGeneration } from "@insta/fe-core/dragonfly/server";
import type { DeliveryProbe } from "../types";
/** Ограничивает время отдельного probe-клиента; закрывает только его и ждёт settlement команды до возврата degraded. */
export const checkDeliveryReadiness = async ({
  open,
  namespace,
  timeoutMs,
  authIdentity,
}: DeliveryProbe): Promise<"ok" | "degraded"> => {
  const client = open();
  const timer = setTimeout(() => client.close(), timeoutMs);
  try {
    await client.connect();
    const generation = await readGeneration({ client, namespace });
    if (generation.startsWith(authIdentity + ":")) return "degraded";
    return "ok";
  } catch {
    return "degraded";
  } finally {
    clearTimeout(timer);
    client.close();
  }
};
