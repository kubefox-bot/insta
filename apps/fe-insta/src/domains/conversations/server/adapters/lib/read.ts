import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import type { z } from "zod";
import {
  type RequestContext,
  readResponse,
  requestContextHeaders,
} from "../../../../../lib/api/server/index";
import type { readRuntimeConfig } from "../../../../../lib/config/server/index";
import { signClientSource } from "../../../../../lib/http/server/index";
import { upstreamUnavailableStatus } from "../../conts";
import { decodeReadResponse } from "./decode-read";

/** Создаёт подписанный REST-вызов с ограниченным чтением тела и проверкой схемы. Транспортные и parse-сбои возвращает как недоступность зависимости. */
export const createReadRequest = ({
  config,
  context,
  source,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  context: RequestContext;
  source: () => Promise<string>;
}>) => {
  return async <T>({
    accessToken,
    method,
    pathname,
    schema,
    execute,
  }: Readonly<{
    accessToken: string;
    method: "GET" | "POST";
    pathname: string;
    schema: z.ZodType<T>;
    execute: (headers: Record<string, string>) => Promise<Response>;
  }>) => {
    try {
      const signed = await signClientSource({
        source: await source(),
        key: config.bffSourceSigningKey,
        now: Date.now(),
        method,
        pathname,
      });
      const response = await execute({
        ...signed,
        authorization: `Bearer ${accessToken}`,
        ...requestContextHeaders(context),
      });
      const raw: unknown = JSON.parse(
        await readResponse({ response, ...config.api }),
      );
      return decodeReadResponse({ response, raw, schema });
    } catch {
      return Result.Error({
        code: CommonErrorCode.DependencyUnavailable,
        status: upstreamUnavailableStatus,
      });
    }
  };
};
