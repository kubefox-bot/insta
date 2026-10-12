import {
  type AcknowledgeReceiptRequest,
  acknowledgeReceiptRequest,
  type ConversationReadRequest,
  createConversationReads,
  createReceiptBackend,
  createSendBackend,
  historyRequest,
  listRequest,
  type SendRequest,
  sendRequest,
  startRequest,
} from "../../../domains/conversations/server/index";
import type { RequestContext } from "../../../lib/api/server/index";
import { readRuntimeConfig } from "../../../lib/config/server/index";
import { createSessionRequest } from "../../users/server/session/index";
/**
 * Собирает request-scoped BFF операции диалогов поверх session owner и REST backend;
 * авторизацию и доменные решения выполняют переданные domain обработчики.
 */
export const createConversationsRequest = ({
  context,
  source,
}: Readonly<{ context: RequestContext; source: () => Promise<string> }>) => ({
  /**
   * Загружает список через conversations BFF с session и read backend текущего запроса.
   */
  list: async (input: ConversationReadRequest) =>
    listRequest(input, await reads({ context, source })),
  /**
   * Загружает историю выбранного диалога через BFF с актуальными session-зависимостями.
   */
  history: async (
    input: ConversationReadRequest & Readonly<{ conversationId: string }>,
  ) => historyRequest(input, await reads({ context, source })),
  /**
   * Передаёт создание диалога BFF с session и read backend; не подменяет проверку получателя
   * composition-логикой.
   */
  start: async (input: ConversationReadRequest) =>
    startRequest(input, await reads({ context, source })),
  /**
   * Собирает receipt backend и session-порты для BFF подтверждения доставки или чтения.
   */
  acknowledgeReceipts: async (input: AcknowledgeReceiptRequest) => {
    const config = readRuntimeConfig();
    return acknowledgeReceiptRequest(input, {
      sessions: await createSessionRequest({ context, source }),
      cookieKey: config.sessionKeys.cookieKey,
      context,
      backend: createReceiptBackend({ config, context, source }),
    });
  },
  /**
   * Собирает send backend и session-порты для BFF отправки сообщения, сохраняя исходный request
   * context.
   */
  send: async (input: SendRequest) => {
    const config = readRuntimeConfig();
    return sendRequest(input, {
      sessions: await createSessionRequest({ context, source }),
      cookieKey: config.sessionKeys.cookieKey,
      context,
      backend: createSendBackend({ config, context, source }),
    });
  },
});

/**
 * Приобретает session-порты и связывает read backend с конфигурацией, корреляцией и
 * источником текущего запроса.
 */
const reads = async ({
  context,
  source,
}: Readonly<{ context: RequestContext; source: () => Promise<string> }>) => {
  const config = readRuntimeConfig();
  return {
    sessions: await createSessionRequest({ context, source }),
    cookieKey: config.sessionKeys.cookieKey,
    context,
    backend: createConversationReads({ config, context, source }),
  };
};
