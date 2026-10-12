import { Result } from "@bloodyowl/boxed";
import {
  ConversationErrorCode,
  ReceiptErrorCode,
} from "@insta/contracts/errors";
import { isMember } from "../membership";
import type { Conversation, Message } from "../types";
import type { ReceiptError } from "./types";
/**
 * Разрешает всю пачку только участнику беседы и только для найденных чужих сообщений этой
 * пары; успех возвращает исходный readonly список, частичное подтверждение исключено.
 */
export const authorizeReceiptBatch = ({
  actorId,
  conversationId,
  conversation,
  messageIds,
  messages,
}: Readonly<{
  actorId: string;
  conversationId: string;
  conversation: Conversation | null;
  messageIds: readonly string[];
  messages: readonly Message[];
}>): Result<readonly Message[], ReceiptError> => {
  if (!conversation)
    return Result.Error(ConversationErrorCode.ConversationNotFound);
  if (!isMember({ actorId, conversation }))
    return Result.Error(ConversationErrorCode.ConversationForbidden);
  const requested = new Set(messageIds);
  if (
    messages.length !== requested.size ||
    messages.some(
      (message) =>
        !requested.has(message.id) ||
        message.conversationId !== conversationId ||
        message.senderId === actorId ||
        !conversation.participantIds.includes(message.senderId),
    )
  )
    return Result.Error(ReceiptErrorCode.InvalidReceiptBatch);
  return Result.Ok(messages);
};
