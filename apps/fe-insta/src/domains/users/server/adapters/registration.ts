import { httpHeaderNames } from "@insta/contracts/http";
import { z } from "zod";
import { completeRegistration } from "../../../../lib/api/generated/clients/completeRegistration";
import { startRegistration } from "../../../../lib/api/generated/clients/startRegistration";
import { verifyRegistration } from "../../../../lib/api/generated/clients/verifyRegistration";
import {
  completeRegistration200Schema,
  completeRegistration400Schema,
} from "../../../../lib/api/generated/schemas/completeRegistrationSchema";
import {
  startRegistration200Schema,
  startRegistration400Schema,
} from "../../../../lib/api/generated/schemas/startRegistrationSchema";
import {
  verifyRegistration200Schema,
  verifyRegistration400Schema,
} from "../../../../lib/api/generated/schemas/verifyRegistrationSchema";
import {
  createApiService,
  createTransport,
} from "../../../../lib/api/server/index";
import type { createAuthBackend } from "./backend";
import { createSignedHeaders } from "./lib/signing/headers";
/**
 * Предоставляет REST-порт этапов регистрации с проверкой ответов, корреляцией и подписанным
 * источником; completion передаёт отдельный ключ идемпотентности.
 */
export const createRegistrationBackend = ({
  config,
  source,
  context,
}: Parameters<typeof createAuthBackend>[0]) => {
  const api = createApiService(config.api);
  const client = createTransport(config.api);
  /**
   * Готовит подпись источника для POST указанного этапа регистрации.
   */
  const headers = (pathname: string) =>
    createSignedHeaders({ source, key: config.bffSourceSigningKey, pathname });
  return {
    /**
     * Запрашивает начало email challenge и возвращает проверенный результат API.
     */
    start: (input: Parameters<typeof startRegistration>[0]) =>
      api.request({
        context,
        outputSchema: z.union([
          startRegistration200Schema,
          startRegistration400Schema,
        ]),
        /**
         * Передаёт email и operationId в generated start с корреляцией и подписью источника.
         */
        execute: async ({ headers: correlation }) =>
          startRegistration(input, {
            client,
            headers: {
              ...correlation,
              ...(await headers("/v1/auth/registration/start")),
            },
          }),
      }),
    /**
     * Проверяет код challenge через backend и возвращает проверенный переход регистрации.
     */
    verify: (input: Parameters<typeof verifyRegistration>[0]) =>
      api.request({
        context,
        outputSchema: z.union([
          verifyRegistration200Schema,
          verifyRegistration400Schema,
        ]),
        /**
         * Отправляет challenge и код в generated verify с подписью источника.
         */
        execute: async ({ headers: correlation }) =>
          verifyRegistration(input, {
            client,
            headers: {
              ...correlation,
              ...(await headers("/v1/auth/registration/verify")),
            },
          }),
      }),
    /**
     * Завершает регистрацию с устойчивым ключом повторов и проверяет выданные credentials либо
     * отказ.
     */
    complete: (
      input: Parameters<typeof completeRegistration>[0],
      key: string,
    ) =>
      api.request({
        context,
        outputSchema: z.union([
          completeRegistration200Schema,
          completeRegistration400Schema,
        ]),
        /**
         * Передаёт proof, профиль и operationId вместе с отдельным заголовком идемпотентности
         * в generated complete.
         */
        execute: async ({ headers: correlation }) =>
          completeRegistration(
            input,
            { [httpHeaderNames.idempotencyKey]: key },
            {
              client,
              headers: {
                ...correlation,
                ...(await headers("/v1/auth/registration/complete")),
              },
            },
          ),
      }),
  };
};
