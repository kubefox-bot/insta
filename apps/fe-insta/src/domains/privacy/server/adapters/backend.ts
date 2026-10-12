import { getPrivacyPreference } from "../../../../lib/api/generated/clients/getPrivacyPreference";
import { savePrivacyPreference } from "../../../../lib/api/generated/clients/savePrivacyPreference";
import { getPrivacyPreference200Schema } from "../../../../lib/api/generated/schemas/getPrivacyPreferenceSchema";
import { savePrivacyPreference200Schema } from "../../../../lib/api/generated/schemas/savePrivacyPreferenceSchema";
import {
  createApiService,
  createTransport,
  type RequestContext,
} from "../../../../lib/api/server/index";
import { signClientSource } from "../../../../lib/http/server/index";
import { consentHeader, preferencesPath } from "../conts";
import type { ServerPreferences } from "../types";
/**
 * Соединяет порт согласия с проверяемыми REST-ответами Nest; для записи добавляет подписанный
 * источник запроса.
 */
export const createBackendPreferences = ({
  config,
  context,
  source,
  clock,
}: Readonly<{
  config: Readonly<{
    api: Readonly<{
      baseURL: string;
      timeoutMs: number;
      maxResponseBytes: number;
    }>;
    bffSourceSigningKey: string;
  }>;
  context: RequestContext;
  source: () => Promise<string>;
  clock: () => number;
}>): ServerPreferences => {
  const client = createTransport(config.api);
  const api = createApiService(config.api);
  const preferences: ServerPreferences = {
    /**
     * Передаёт доступное доказательство контекста при чтении; ошибку API превращает в отказ
     * операции.
     */
    read: async (proof) => {
      const result = await api.request({
        /**
         * Вызывает generated GET с контекстными заголовками и необязательным доказательством
         * согласия.
         */
        execute: ({ headers }) =>
          getPrivacyPreference(undefined, {
            client,
            headers: {
              ...headers,
              ...(proof ? { [consentHeader]: proof } : {}),
            },
          }),
        outputSchema: getPrivacyPreference200Schema,
        context,
      });
      if (result.isError()) throw new Error("Privacy read unavailable");
      return result.get();
    },
    /**
     * Получает доверенный источник, подписывает запись и возвращает проверенный результат
     * сохранения; ошибка API отклоняет операцию.
     */
    save: async (input, proof) => {
      const trustedSource = await source();
      const result = await api.request({
        /**
         * Отправляет выбор с подписью источника, временем и доказательством контекста на
         * endpoint предпочтений.
         */
        execute: ({ headers }) =>
          savePrivacyPreference(input, undefined, {
            client,
            headers: {
              ...headers,
              ...signClientSource({
                source: trustedSource,
                key: config.bffSourceSigningKey,
                now: clock(),
                method: "POST",
                pathname: preferencesPath,
              }),
              ...(proof ? { [consentHeader]: proof } : {}),
            },
          }),
        outputSchema: savePrivacyPreference200Schema,
        context,
      });
      if (result.isError()) throw new Error("Privacy save unavailable");
      return result.get();
    },
  };
  return preferences;
};
