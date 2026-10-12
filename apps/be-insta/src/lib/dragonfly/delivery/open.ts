import { RedisClient } from "bun";
import { readBrokerIdentity } from "../identity";
import type { DeliveryProviderOptions } from "./types";
/** Создаёт отключённый owned client без скрытого replay или reconnect timers. */
export const createClient = (options: DeliveryProviderOptions) =>
  new RedisClient(options.config.url, {
    connectionTimeout: options.config.timeoutMs,
    autoReconnect: false,
    enableOfflineQueue: false,
  });
/** Ограничивает connect и physical identity validation; до успешного результата mutations запрещены. */
export const openVerifiedClient = async (
  client: RedisClient,
  options: DeliveryProviderOptions,
) => {
  const timer = setTimeout(() => client.close(), options.config.timeoutMs);
  try {
    await client.connect();
    if ((await readBrokerIdentity(client)) === options.authIdentity)
      throw new Error("Auth and delivery require distinct physical brokers");
    return client;
  } catch (error) {
    client.close();
    throw new Error("Delivery broker connection unavailable", { cause: error });
  } finally {
    clearTimeout(timer);
  }
};
