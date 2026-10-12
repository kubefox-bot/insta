import type { Conversation, Message } from "../../domain/types";
import { conversationDocumentSchema, messageDocumentSchema } from "./schema";
/**
 * Валидирует Mongo-документ беседы и переводит id/Date в доменные значения; повреждённые
 * данные вызывают ошибку.
 */
export const mapConversation = (value: unknown): Conversation => {
  const document = conversationDocumentSchema.parse(value);
  return {
    id: document._id.toHexString(),
    participantIds: document.participantIds,
    lastSequence: document.lastSequence,
    lastActivityAt: document.lastActivityAt.getTime(),
  };
};
/**
 * Валидирует сохранённое сообщение и переводит ObjectId/Date в доменный контракт,
 * сохраняя необязательный clientMessageId.
 */
export const mapMessage = (value: unknown): Message => {
  const document = messageDocumentSchema.parse(value);
  return {
    id: document._id.toHexString(),
    conversationId: document.conversationId,
    senderId: document.senderId,
    ...(document.clientMessageId === undefined
      ? {}
      : { clientMessageId: document.clientMessageId }),
    text: document.text,
    sequence: document.sequence,
    createdAt: document.createdAt.getTime(),
  };
};
