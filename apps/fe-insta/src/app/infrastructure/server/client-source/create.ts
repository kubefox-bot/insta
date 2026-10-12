import { readRuntimeConfig } from "../../../../lib/config/server/index";
import {
  createTrustedSourceResolver,
  resolveProxyPeers,
} from "../../../../lib/http/server/index";

const state: { resolver?: ReturnType<typeof createTrustedSourceResolver> } = {};
/**
 * Лениво создаёт процессный resolver доверенного proxy и определяет источник запроса;
 * DNS/cache и проверка forwarded-цепочки остаются у resolver.
 */
export const readTrustedClientSource: ReturnType<
  typeof createTrustedSourceResolver
>["read"] = (input) => {
  state.resolver ??= createTrustedSourceResolver({
    hostname: readRuntimeConfig().trustedWebProxyHost,
    resolve: resolveProxyPeers,
    clock: Date.now,
  });
  return state.resolver.read(input);
};
