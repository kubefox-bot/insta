import type { RedisClient } from "bun";
import { createClient, openVerifiedClient } from "./open";
import type { DeliveryProviderOptions } from "./types";
/** Владеет открывающимися readers; успешно открытый client передаёт Streams adapter для blocking-read lifecycle. */
export const createDeliveryReaders = (options: DeliveryProviderOptions) => {
  const opening = new Map<RedisClient, Promise<RedisClient>>();
  const state = { closed: false };
  return {
    open: (): Promise<RedisClient> => {
      if (state.closed)
        return Promise.reject(new Error("Delivery connection closed"));
      const client = createClient(options);
      const operation = openVerifiedClient(client, options)
        .then(() => {
          if (state.closed) {
            client.close();
            throw new Error("Delivery connection closed");
          }
          return client;
        })
        .finally(() => opening.delete(client));
      opening.set(client, operation);
      return operation;
    },
    close: async () => {
      state.closed = true;
      for (const client of opening.keys()) client.close();
      await Promise.allSettled(opening.values());
    },
  };
};
