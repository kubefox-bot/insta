import { receiptBatchSchema } from "@insta/contracts/messages";
import { webSessionHeaders } from "../../../../lib/session/contracts/index";
import { conversationIdSchema } from "../../contracts/schema";
import type { ConversationActor, ConversationHttp } from "../types";
import { receiptTransportCodes } from "./conts";
import { decodeReceiptReply } from "./decode";
import type {
  AcknowledgeReceiptsInput,
  ReceiptBatchWireSnapshot,
} from "./types";
/** Связывает HTTP отправку квитанций с конкретным пользователем и поколением сессии. */
export const createReceiptTransport = ({
  actor,
  request = fetch,
}: Readonly<{ actor: ConversationActor; request?: ConversationHttp }>) => ({
  /** Валидирует пакет, отправляет его через BFF с заголовками владельца и сигналом отмены, затем проверяет принадлежность ответа. */
  acknowledge: async ({
    conversationId,
    messageIds,
    status,
    signal,
  }: AcknowledgeReceiptsInput): Promise<ReceiptBatchWireSnapshot> => {
    const id = conversationIdSchema.safeParse(conversationId);
    const payload = receiptBatchSchema.safeParse({ messageIds, status });
    if (!id.success || !payload.success)
      throw new Error(receiptTransportCodes.invalidInput);
    signal.throwIfAborted();
    const response = await request(
      `/api/conversations/${encodeURIComponent(id.data)}/receipts`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal,
        headers: {
          "Content-Type": "application/json",
          [webSessionHeaders.ownerId]: actor.userId,
          [webSessionHeaders.generation]: actor.generation,
        },
        body: JSON.stringify(payload.data),
      },
    );
    const raw: unknown = await response.json();
    signal.throwIfAborted();
    return decodeReceiptReply({
      response,
      raw,
      conversationId,
      messageIds,
      recipientId: actor.userId,
    });
  },
});
