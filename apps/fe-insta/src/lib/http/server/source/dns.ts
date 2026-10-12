import { Resolver } from "node:dns/promises";
import { proxyResolutionPolicy } from "./conts";
/**
 * Параллельно разрешает IPv4/IPv6 доверенного proxy с ограниченными DNS retry/timeout.
 * Частичный успех допустим, полное отсутствие адресов — ошибка; resolver отменяется в
 * finally.
 */
export const resolveProxyPeers = async (
  hostname: string,
): Promise<readonly string[]> => {
  const resolver = new Resolver({
    timeout: proxyResolutionPolicy.timeoutMs,
    tries: proxyResolutionPolicy.tries,
  });
  try {
    const outcomes = await Promise.allSettled([
      resolver.resolve4(hostname),
      resolver.resolve6(hostname),
    ]);
    const addresses = outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? outcome.value : [],
    );
    if (!addresses.length)
      throw new Error("Trusted proxy resolution unavailable");
    return addresses;
  } finally {
    resolver.cancel();
  }
};
