import { createBackendPreferences } from "../../../domains/privacy/server/index";
import type { RequestContext } from "../../../lib/api/server/index";
import { readRuntimeConfig } from "../../../lib/config/server/index";
/**
 * Собирает server-only preference backend и ключ cookie из проверенной конфигурации;
 * контекст, источник и часы передаются адаптеру, клиент браузера ключ не получает.
 */
export const createPrivacyRequest = (
  context: RequestContext,
  source: () => Promise<string>,
) => {
  const config = readRuntimeConfig();
  return {
    preferences: createBackendPreferences({
      config,
      context,
      source,
      clock: Date.now,
    }),
    key: config.privacyEncryptionKey,
  };
};
