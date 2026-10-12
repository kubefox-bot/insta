import type { Options } from "ky";
import { z } from "zod";
import type { RequestConfig } from "../types";
/**
 * Строит URL generated-запроса и валидирует плоские query-параметры перед сериализацией.
 * При наличии params заменяет query целиком; неверная форма вызывает Zod-ошибку.
 */
export const requestUrl = ({
  request,
  baseURL,
}: {
  readonly request: RequestConfig;
  readonly baseURL: string;
}) => {
  const url = new URL(request.url ?? "", baseURL);
  if (request.params === undefined) return url;
  const values = z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .parse(request.params);
  url.search = new URLSearchParams(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  ).toString();
  return url;
};
/**
 * Передаёт FormData как multipart body, остальные заданные значения как JSON.
 * Отсутствующее значение не создаёт тело запроса.
 */
const requestBody = (data: unknown): Options => {
  if (data instanceof FormData) return { body: data };
  return data === undefined ? {} : { json: data };
};
/**
 * Адаптирует generated request к ky, сохраняя method, headers и AbortSignal. Выбор
 * JSON/multipart принадлежит локальному преобразованию тела.
 */
export const requestOptions = (request: RequestConfig): Options => ({
  ...requestBody(request.data),
  ...(request.method ? { method: request.method } : {}),
  ...(request.headers ? { headers: request.headers } : {}),
  ...(request.signal ? { signal: request.signal } : {}),
});
