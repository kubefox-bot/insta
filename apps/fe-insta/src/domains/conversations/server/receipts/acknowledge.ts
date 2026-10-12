import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, ReceiptErrorCode } from "@insta/contracts/errors";
import { receiptBatchSchema } from "@insta/contracts/messages";
import { acceptsCookieMutation } from "../../../../lib/http/server/index";
import { conversationIdSchema } from "../../contracts/schema";
import { sendStatus } from "../conts";
import { authorizeConversation } from "../lib/authorized";
import { conversationReply } from "../lib/reply";
import { invalidReceiptStatus } from "./conts";
import type {
  AcknowledgeReceiptDependencies,
  AcknowledgeReceiptRequest,
} from "./types";
/** Проверяет origin, диалог и пакет receipt перед авторизованным подтверждением; возвращает BFF-envelope с ограниченным контекстом запроса. */
export const acknowledgeReceiptRequest = async (
  { request, origin, cookies, conversationId }: AcknowledgeReceiptRequest,
  dependencies: AcknowledgeReceiptDependencies,
) => {
  const context = {
    requestId: dependencies.context.requestId,
    operationId: dependencies.context.operationId,
  };
  if (!acceptsCookieMutation({ request, origin }))
    return conversationReply(
      Result.Error({
        code: CommonErrorCode.Forbidden,
        status: sendStatus.FORBIDDEN,
      }),
      context,
    );
  const id = conversationIdSchema.safeParse(conversationId);
  const payload = await request.json().then(
    (raw) => receiptBatchSchema.safeParse(raw),
    () => null,
  );
  if (!id.success || !payload?.success)
    return conversationReply(
      Result.Error({
        code: ReceiptErrorCode.InvalidReceiptBatch,
        status: invalidReceiptStatus,
      }),
      context,
    );
  const result = await authorizeConversation(
    {
      request,
      origin,
      cookies,
      /** Передаёт проверенный пакет подтверждений backend от имени привязанной сессии. */
      execute: (accessToken) =>
        dependencies.backend({
          accessToken,
          conversationId: id.data,
          payload: payload.data,
        }),
    },
    dependencies,
  );
  return conversationReply(result, context);
};
