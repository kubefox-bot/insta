import { Result } from "@bloodyowl/boxed";
import { sourceAddressSchema } from "@insta/contracts/http";
import { proxyResolutionPolicy } from "./conts";

/**
 * Создаёт владельца DNS lease доверенного proxy и совместного pending lookup. Forwarded
 * адрес принимается только от peer из актуального lease; ошибки DNS не расширяют доверие.
 */
export const createTrustedSourceResolver = ({
  hostname,
  resolve,
  clock,
}: Readonly<{
  hostname?: string;
  resolve: (hostname: string) => Promise<readonly string[]>;
  clock: () => number;
}>) => {
  const state: {
    lease?: Readonly<{ addresses: readonly string[]; expiresAt: number }>;
    pending?: Promise<readonly string[]>;
  } = {};
  /**
   * Переиспользует lease или общий DNS-запрос; валидирует адреса и кеширует пустой
   * результат при отказе. После settlement снимает pending, не сохраняя просроченное
   * доверие.
   */
  const resolvePeers = async (): Promise<readonly string[]> => {
    if (!hostname) return [];
    if (state.lease && clock() < state.lease.expiresAt)
      return state.lease.addresses;
    if (state.pending) return state.pending;
    state.lease = undefined;
    const pending = (async () => {
      const outcome = await Result.fromPromise(resolve(hostname));
      const addresses = outcome.isOk()
        ? outcome.get().flatMap((address) => {
            const parsed = sourceAddressSchema.safeParse(address);
            return parsed.success ? [parsed.data] : [];
          })
        : [];
      state.lease = {
        addresses,
        expiresAt: clock() + proxyResolutionPolicy.leaseMs,
      };
      return addresses;
    })();
    state.pending = pending;
    try {
      return await pending;
    } finally {
      state.pending = undefined;
    }
  };
  return {
    /**
     * Проверяет peer и использует forwarded адрес лишь для доверенного proxy. Неверный
     * peer даёт unknown, неверный forwarded сохраняет адрес самого peer.
     */
    read: async ({
      peer,
      forwardedFor,
    }: Readonly<{ peer: string; forwardedFor?: string | null }>) => {
      const parsedPeer = sourceAddressSchema.safeParse(peer);
      if (!parsedPeer.success) return "unknown";
      const addresses = await resolvePeers();
      if (!addresses.includes(parsedPeer.data)) return parsedPeer.data;
      const forwarded = sourceAddressSchema.safeParse(forwardedFor);
      return forwarded.success ? forwarded.data : parsedPeer.data;
    },
  };
};
