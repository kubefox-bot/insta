import { RedisClient } from "bun";
/** Успешное соединение передаётся lifecycle приложения; неудачное закрывается. */
export const connectDragonfly = async ({
  url,
  timeoutMs,
}: Readonly<{ url: string; timeoutMs: number }>) => {
  const client = new RedisClient(url, {
    connectionTimeout: timeoutMs,
    autoReconnect: false,
    enableOfflineQueue: false,
  });
  try {
    await client.connect();
    return client;
  } catch (error) {
    client.close();
    throw error;
  }
};
