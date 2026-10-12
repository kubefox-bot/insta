import type { RedisClient } from "bun";
import type { DeliveryConnection } from "../types";
import { createCommandConnection } from "./connection";
import { createDeliveryReaders } from "./readers";
import type { DeliveryProviderOptions } from "./types";
/** Собирает lifecycle delivery provider. Команда отправляется один раз; close отменяет transport перед ожиданием settlement. */
export const createDeliveryConnection = (
  options: DeliveryProviderOptions,
): DeliveryConnection => {
  const connection = createCommandConnection(options);
  const readers = createDeliveryReaders(options);
  const pending = new Set<Promise<unknown>>();
  /** Отправляет команду один раз, отменяет owned transport по timeout и учитывает фактический settlement для close. */
  const execute = <T>(
    command: (client: RedisClient) => Promise<T>,
  ): Promise<T> => {
    const operation = (async () => {
      const client = await connection.get();
      const timer = setTimeout(() => client.close(), options.config.timeoutMs);
      try {
        return await command(client);
      } finally {
        clearTimeout(timer);
      }
    })();
    pending.add(operation);
    return operation.finally(() => pending.delete(operation));
  };
  return {
    client: {
      send: (command, args) => execute((client) => client.send(command, args)),
      get: (key) => execute((client) => client.get(key)),
    },
    openReader: readers.open,
    close: async () => {
      await Promise.allSettled([
        connection.close(),
        readers.close(),
        ...pending,
      ]);
    },
  };
};
