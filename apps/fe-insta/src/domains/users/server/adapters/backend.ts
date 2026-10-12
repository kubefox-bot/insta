import { z } from "zod";
import { login } from "../../../../lib/api/generated/clients/login";
import {
  login200Schema,
  login401Schema,
} from "../../../../lib/api/generated/schemas/loginSchema";
import {
  createApiService,
  createTransport,
  type RequestContext,
} from "../../../../lib/api/server/index";
import { createSignedHeaders } from "./lib/signing/headers";
/**
 * Соединяет вход по email/password с Nest REST, проверкой wire-ответов и подписью источника
 * запроса.
 */
export const createAuthBackend = ({
  config,
  source,
  context,
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
}>) => {
  const api = createApiService(config.api);
  const client = createTransport(config.api);
  return {
    /**
     * Запрашивает credentials для входа и возвращает Result API с проверенным успешным либо
     * ошибочным ответом.
     */
    login: (input: Readonly<{ email: string; password: string }>) =>
      api.request({
        context,
        outputSchema: z.union([login200Schema, login401Schema]),
        /**
         * Отправляет данные входа с корреляцией и подписью источника для endpoint login.
         */
        execute: async ({ headers }) =>
          login(input, {
            client,
            headers: {
              ...headers,
              ...(await createSignedHeaders({
                source,
                key: config.bffSourceSigningKey,
                pathname: "/v1/auth/login",
              })),
            },
          }),
      }),
  };
};
