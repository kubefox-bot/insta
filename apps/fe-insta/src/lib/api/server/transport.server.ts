import "$app/server";
import ky from "ky";
import {
  readApiConfiguration,
  validateApiConfiguration,
} from "../../config/read.server";
import { requestOptions, requestUrl } from "./lib/request";
import type {
  ApiConfiguration,
  Client,
  RequestConfig,
  ResponseConfig,
  ResponseErrorConfig,
} from "./types";

export type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig };
/**
 * Создаёт серверный ky transport из валидированной конфигурации. Отключает автоматические
 * повторы и HTTP-исключения, оставляя проверку ответа API service; передаёт signal
 * вызывающего кода.
 */
export const createTransport = (
  input: ApiConfiguration & { readonly baseURL: string },
) => {
  const configuration = validateApiConfiguration(input);
  const http = ky.create({
    retry: 0,
    timeout: configuration.timeoutMs,
    throwHttpErrors: false,
  });
  return async <Data, _Error = unknown, Input = unknown>(
    request: RequestConfig<Input>,
  ): Promise<ResponseConfig<Data>> =>
    http(
      requestUrl({ request, baseURL: configuration.baseURL }),
      requestOptions(request),
    );
};
/**
 * Обслуживает generated REST-клиенты через актуальную серверную конфигурацию. Возвращает
 * сырой Response для отдельного владельца проверки envelope.
 */
const client = <Data, Error = unknown, Input = unknown>(
  request: RequestConfig<Input>,
): Promise<ResponseConfig<Data>> =>
  createTransport(readApiConfiguration())<Data, Error, Input>(request);
export default client;
