import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { issueWsTicket } from "../../../../lib/api/generated/clients/issueWsTicket";
import {
  issueWsTicket200Schema,
  issueWsTicket401Schema,
} from "../../../../lib/api/generated/schemas/issueWsTicketSchema";
import {
  createApiService,
  createTransport,
} from "../../../../lib/api/server/index";
import { serverErrorStatus } from "../../../../lib/http/server/index";
import type { createAuthBackend } from "./backend";
/**
 * Создаёт запрос websocket-ticket по access token; известные клиентские отказы сохраняет,
 * транспортные и серверные сбои сводит к session_unavailable.
 */
export const createTicketBackend = ({
  config,
  context,
}: Parameters<typeof createAuthBackend>[0]) => {
  const api = createApiService(config.api);
  const client = createTransport(config.api);
  return async (
    accessToken: string,
  ): Promise<
    Result<
      z.infer<typeof issueWsTicket200Schema>["data"],
      Readonly<{ code: string }>
    >
  > => {
    const result = await api.request({
      context,
      outputSchema: z.union([issueWsTicket200Schema, issueWsTicket401Schema]),
      /**
       * Запрашивает одноразовый ticket через generated REST-клиент с bearer-токеном и
       * корреляционными заголовками.
       */
      execute: ({ headers }) =>
        issueWsTicket({
          client,
          headers: { ...headers, authorization: `Bearer ${accessToken}` },
        }),
    });
    if (result.isOk()) return Result.Ok(result.get());
    const error = result.getError();
    return Result.Error({
      code:
        error.kind === "api" && error.status < serverErrorStatus
          ? error.error.code
          : SessionErrorCode.SessionUnavailable,
    });
  };
};
