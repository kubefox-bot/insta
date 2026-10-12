import { ObjectId } from "mongodb";
import type { Message } from "../../../domain/types";
import { collections } from "../conts";
import { mapMessage } from "../mapper";
import type { MessageDocument, MessageIdentityDocument } from "../types";
import { recordMessageEvent } from "./record-event";
import type { PersistMessageInput } from "./types";
/**
 * Записывает message, identity, изменение sequence/activity, каноническое событие и
 * outbox в транзакции вызывающего; объекты insert разделены из-за добавления Mongo поля
 * _id.
 */
export const persistMessage = async ({
  db,
  session,
  input,
  messageId,
  sequence,
  reference,
  serverNowMs,
  retentionMs,
  participantIds,
}: PersistMessageInput): Promise<Message> => {
  const document: MessageDocument = {
    _id: messageId,
    conversationId: input.conversationId,
    senderId: input.actorId,
    text: input.text,
    sequence,
    createdAt: new Date(input.createdAt),
    ...(input.clientMessageId === undefined
      ? {}
      : { clientMessageId: input.clientMessageId }),
  };
  await db.collection(collections.conversations).updateOne(
    { _id: new ObjectId(input.conversationId) },
    {
      $inc: { lastSequence: 1 },
      $max: { lastActivityAt: document.createdAt },
    },
    { session },
  );
  await db
    .collection<MessageDocument>(collections.messages)
    .insertOne(document, { session });
  await db
    .collection<MessageIdentityDocument>(collections.identities)
    .insertOne(
      {
        _id: messageId.toHexString(),
        actorId: input.actorId,
        conversationId: input.conversationId,
        messageId: messageId.toHexString(),
        fingerprint: input.fingerprint,
        ...(input.keyDigest === undefined
          ? {}
          : { keyDigest: input.keyDigest }),
      },
      { session },
    );
  await recordMessageEvent({
    db,
    session,
    input,
    messageId,
    sequence,
    ...(reference ? { reference } : {}),
    serverNowMs,
    retentionMs,
    participantIds,
  });
  return mapMessage(document);
};
