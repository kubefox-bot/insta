import { httpHeaderNames } from "@insta/contracts/http";
import { z } from "zod";
import { issueSupportContext } from "../../../../lib/api/generated/clients/issueSupportContext";
import { submitSupportReport } from "../../../../lib/api/generated/clients/submitSupportReport";
import {
  issueSupportContext200Schema,
  issueSupportContext503Schema,
} from "../../../../lib/api/generated/schemas/issueSupportContextSchema";
import {
  submitSupportReport202Schema,
  submitSupportReport503Schema,
} from "../../../../lib/api/generated/schemas/submitSupportReportSchema";
import {
  createTransport,
  type RequestContext,
  readResponse,
  requestContextHeaders,
} from "../../../../lib/api/server/index";
import { signClientSource } from "../../../../lib/http/server/index";
import type { SupportBackend } from "../types";
/**
 * Подключает операции поддержки к Nest REST с подписью источника, корреляцией и проверкой
 * ограниченного по размеру ответа.
 */
export const createSupportBackend = ({
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
  source: () => Promise<string>;
  context: RequestContext;
}>): SupportBackend => {
  const client = createTransport(config.api);
  /**
   * Подписывает доверенный источник для конкретных метода и пути, добавляя заголовки
   * корреляции запроса.
   */
  const headers = async (method: string, pathname: string) => ({
    ...(await signClientSource({
      source: await source(),
      key: config.bffSourceSigningKey,
      now: Date.now(),
      method,
      pathname,
    })),
    ...requestContextHeaders(context),
  });
  /**
   * Читает ограниченный ответ, проверяет JSON по схеме и сохраняет HTTP-статус, запрещая
   * кеширование.
   */
  const validate = async (response: Response, schema: z.ZodType) => {
    const data = await readResponse({ response, ...config.api });
    const parsed = schema.parse(JSON.parse(data));
    return Response.json(parsed, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  };
  return {
    /**
     * Запрашивает backend-контекст формы с подписью источника и проверяет успешный либо
     * недоступный ответ.
     */
    context: async () =>
      validate(
        await issueSupportContext({
          client,
          headers: await headers("GET", "/v1/support/form-context"),
        }),
        z.union([issueSupportContext200Schema, issueSupportContext503Schema]),
      ),
    /**
     * Передаёт отчёт с ключом идемпотентности и необязательным токеном; возвращает проверенную
     * квитанцию или ошибку backend.
     */
    submit: async ({ payload, key, accessToken }) =>
      validate(
        await submitSupportReport(
          payload,
          { [httpHeaderNames.idempotencyKey]: key },
          {
            client,
            headers: {
              ...(await headers("POST", "/v1/support/reports")),
              ...(accessToken
                ? { [httpHeaderNames.authorization]: `Bearer ${accessToken}` }
                : {}),
            },
          },
        ),
        z.union([submitSupportReport202Schema, submitSupportReport503Schema]),
      ),
  };
};
