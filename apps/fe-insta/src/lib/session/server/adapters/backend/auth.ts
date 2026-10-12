import { httpHeaderNames } from "@insta/contracts/http";
import { z } from "zod";
import { refresh } from "../../../../api/generated/clients/refresh";
import { revokeSession } from "../../../../api/generated/clients/revokeSession";
import {
  refresh200Schema,
  refresh401Schema,
} from "../../../../api/generated/schemas/refreshSchema";
import {
  revokeSession200Schema,
  revokeSession401Schema,
} from "../../../../api/generated/schemas/revokeSessionSchema";
import {
  createApiService,
  createTransport,
  type RequestContext,
} from "../../../../api/server/index";
import { signClientSource } from "../../../../http/server/index";
import type { BackendAuth } from "../../ports/backend-auth";
import { createActorReader } from "./actor";
import { mapBackendResult } from "./result";
import type { BackendConfiguration } from "./types";
/** Собирает REST auth-порт с ограниченным транспортом и request context. Мутации получают подпись источника и ключ идемпотентности; транспортные/серверные ошибки отображаются в неизвестный исход через mapBackendResult. */
export const createBackendAuth = ({
  config,
  context,
  source,
}: Readonly<{
  config: BackendConfiguration;
  context: RequestContext;
  source: () => Promise<string>;
}>): BackendAuth => {
  const client = createTransport(config.api);
  const api = createApiService(config.api);
  /** Получает актуальный источник и подписывает POST к конкретному backend pathname текущим временем. Ошибка получения источника передаётся запросу; секрет подписи в браузер не возвращается. */
  const mutationHeaders = async (pathname: string) =>
    signClientSource({
      source: await source(),
      key: config.bffSourceSigningKey,
      now: Date.now(),
      method: "POST",
      pathname,
    });
  return {
    /** Отправляет refresh token с сохранённым ключом попытки; валидирует 200/401 контракт и отображает остальные сбои через общую модель неизвестного исхода. */
    refresh: async ({ refreshToken, key }) =>
      mapBackendResult(
        await api.request({
          context,
          outputSchema: z.union([refresh200Schema, refresh401Schema]),
          /** Передаёт generated refresh-клиенту токен, ключ идемпотентности, request headers и подпись именно /v1/auth/refresh; Promise ответа принадлежит api.request. */
          execute: async ({ headers }) =>
            refresh(
              { refreshToken },
              { [httpHeaderNames.idempotencyKey]: key },
              {
                client,
                headers: {
                  ...headers,
                  ...(await mutationHeaders("/v1/auth/refresh")),
                },
              },
            ),
        }),
      ),
    /** Вызывает backend revoke по sessionId и revoke secret с устойчивым ключом, валидируя контракт ответа перед передачей сценариям сессий. */
    revoke: async ({ backendSessionId, revokeSecret, key }) =>
      mapBackendResult(
        await api.request({
          context,
          outputSchema: z.union([
            revokeSession200Schema,
            revokeSession401Schema,
          ]),
          /** Добавляет к generated revoke-запросу корреляционные headers и подпись /v1/auth/sessions/revoke; авторизация этого запроса опирается на переданный revoke secret. */
          execute: async ({ headers }) =>
            revokeSession(
              { backendSessionId, revokeSecret },
              { [httpHeaderNames.idempotencyKey]: key },
              {
                client,
                headers: {
                  ...headers,
                  ...(await mutationHeaders("/v1/auth/sessions/revoke")),
                },
              },
            ),
        }),
      ),
    authorize: createActorReader({ api, client, context }),
  };
};
