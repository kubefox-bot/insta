import { requestLimits } from "@insta/contracts/http";
import { defaultRequestLimitOptions } from "./conts";
import { inspectJsonBodyLimit } from "./lib/json-limit";
import type { RequestLimitOptions } from "./types";
/**
 * Проверяет размер заголовков до чтения тела; в JSON-режиме дополнительно проверяет поток
 * копии запроса. Возвращает вид превышения либо null, не подменяя ошибки чтения успешным
 * допуском.
 */
export const inspectRequestLimits = async (
  request: Request,
  options: RequestLimitOptions = defaultRequestLimitOptions,
): Promise<"headers" | "json" | null> => {
  const headerBytes = [...request.headers].reduce(
    (total, [key, value]) =>
      total + new TextEncoder().encode(`${key}: ${value}\r\n`).byteLength,
    0,
  );
  if (headerBytes > requestLimits.headerBytes) return "headers";
  switch (options.mode) {
    case "headers_only":
      return null;
    case "headers_and_json":
      return inspectJsonBodyLimit(request);
    default: {
      const unsupported: never = options.mode;
      throw new Error(`Unsupported request limit mode: ${unsupported}`);
    }
  }
};
