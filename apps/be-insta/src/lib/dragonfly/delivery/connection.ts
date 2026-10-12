import type { RedisClient } from "bun";
import { createClient, openVerifiedClient } from "./open";
import type { DeliveryProviderOptions } from "./types";
/** Владеет одной lazy command connection: один bounded connect для конкурентных запросов, следующая операция может восстановиться. */
export const createCommandConnection = (options: DeliveryProviderOptions) => {
  const state: {
    client: RedisClient | undefined;
    connecting: Promise<RedisClient> | undefined;
    closed: boolean;
  } = { client: undefined, connecting: undefined, closed: false };
  /** Объединяет конкурентный connect и physical identity validation; новая операция после неудачи может начать следующую bounded попытку. */
  const get = (): Promise<RedisClient> => {
    if (state.closed)
      return Promise.reject(new Error("Delivery connection closed"));
    if (state.connecting) return state.connecting;
    if (state.client?.connected) return Promise.resolve(state.client);
    state.client?.close();
    const candidate = createClient(options);
    state.client = candidate;
    state.connecting = openVerifiedClient(candidate, options)
      .then((client) => {
        if (state.closed) {
          client.close();
          throw new Error("Delivery connection closed");
        }
        return client;
      })
      .catch((error) => {
        if (state.client === candidate) state.client = undefined;
        throw error;
      })
      .finally(() => {
        state.connecting = undefined;
      });
    return state.connecting;
  };
  return {
    get,
    close: async () => {
      state.closed = true;
      state.client?.close();
      if (state.connecting) await Promise.allSettled([state.connecting]);
    },
  };
};
