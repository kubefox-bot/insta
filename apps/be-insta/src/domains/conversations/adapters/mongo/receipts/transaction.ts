import { Result } from "@bloodyowl/boxed";
import { ObjectId } from "mongodb";
import { authorizeReceiptBatch } from "../../../domain/receipts/authorize";
import { collections } from "../conts";
import { mapConversation, mapMessage } from "../mapper";
import type { ConversationDocument, MessageDocument } from "../types";
import { persistReceiptChanges } from "./persist";
import { recordReceiptEvent } from "./record-event";
import type { ReceiptTransaction } from "./types";
/**
 * В транзакции вызывающего авторизует всю пачку, сохраняет монотонные изменения и outbox
 * только для changed; проверяет abort на входе и перед возвратом, чтобы прервать commit.
 */
export const commitReceiptTransaction = async ({
  db,
  session,
  input,
  eventId,
  serverNowMs,
  retentionMs,
}: ReceiptTransaction) => {
  input.signal?.throwIfAborted();
  const conversation = await db
    .collection<ConversationDocument>(collections.conversations)
    .findOne({ _id: new ObjectId(input.conversationId) }, { session });
  const rows = await db
    .collection<MessageDocument>(collections.messages)
    .find(
      { _id: { $in: input.messageIds.map((id) => new ObjectId(id)) } },
      { session },
    )
    .toArray();
  const permitted = authorizeReceiptBatch({
    ...input,
    conversation: conversation ? mapConversation(conversation) : null,
    messages: rows.map(mapMessage),
  });
  if (permitted.isError()) return Result.Error(permitted.getError());
  const { snapshots, changed } = await persistReceiptChanges({
    db,
    session,
    input,
    messages: permitted.get(),
  });
  if (changed.length)
    await recordReceiptEvent({
      db,
      session,
      input,
      eventId,
      serverNowMs,
      retentionMs,
      changed,
    });
  input.signal?.throwIfAborted();
  return Result.Ok({
    conversationId: input.conversationId,
    receipts: snapshots,
  });
};
