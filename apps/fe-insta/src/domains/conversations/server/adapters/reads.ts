import { listHistory } from "../../../../lib/api/generated/clients/listHistory";
import { startConversation } from "../../../../lib/api/generated/clients/startConversation";
import {
  createTransport,
  type RequestContext,
} from "../../../../lib/api/server/index";
import type { readRuntimeConfig } from "../../../../lib/config/server/index";
import { historySchema, startSchema } from "../../contracts/schema";
import type { ConversationReads } from "../ports/reads";
import { createReadRequest } from "./lib/read";
import { createUnreadListRead } from "./list";

/** Связывает generated REST-клиент с подписанными операциями списка, истории и запуска диалога; транспорт остаётся серверным. */
export const createConversationReads = ({
  config,
  context,
  source,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  context: RequestContext;
  source: () => Promise<string>;
}>): ConversationReads => {
  const client = createTransport(config.api);
  const request = createReadRequest({ config, context, source });
  return {
    list: createUnreadListRead({ client, request }),
    /** Читает страницу истории с заданными cursor, after и limit через общую проверку ответа. */
    history: ({ accessToken, conversationId, cursor, after, limit }) =>
      request({
        accessToken,
        method: "GET",
        pathname: `/v1/conversations/${conversationId}/messages`,
        schema: historySchema,
        /** Передаёт только присутствующие параметры страницы generated клиенту истории. */
        execute: (headers) =>
          listHistory(
            conversationId,
            {
              ...(limit !== undefined ? { limit } : {}),
              ...(cursor ? { cursor } : {}),
              ...(after !== undefined ? { after } : {}),
            },
            { client, headers },
          ),
      }),
    /** Запускает диалог с выбранным получателем через подписанный POST. */
    start: ({ accessToken, recipientId }) =>
      request({
        accessToken,
        method: "POST",
        pathname: "/v1/conversations",
        schema: startSchema,
        /** Вызывает generated операцию запуска с проверяемым получателем и подготовленными заголовками. */
        execute: (headers) =>
          startConversation({ recipientId }, undefined, { client, headers }),
      }),
  };
};
