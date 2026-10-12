import { Result } from "@bloodyowl/boxed";
import { ConversationErrorCode } from "@insta/contracts/errors";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { historyWindow } from "../../domain/history/window";
import { isMember } from "../../domain/membership";
import type { Conversations } from "../../ports/conversations";
import { collections, transactionOptions } from "./conts";
import { mapConversation } from "./mapper";
import { readMessagesPage } from "./messages-page";
import type { ConversationDocument } from "./types";
/**
 * Создаёт чтение истории в едином transaction snapshot: проверяет membership и watermark,
 * затем сообщения/receipts; временную session закрывает при любом исходе.
 */
export const createReadHistory =
  ({
    db,
    startSession,
  }: Readonly<{
    db: Db;
    startSession: () => ClientSession;
  }>): Conversations["history"] =>
  async ({ actorId, conversationId, range, limit }) => {
    if (!ObjectId.isValid(conversationId))
      return Result.Error(ConversationErrorCode.ConversationNotFound);
    const session = startSession();
    try {
      return await session.withTransaction(async () => {
        const document = await db
          .collection<ConversationDocument>(collections.conversations)
          .findOne({ _id: new ObjectId(conversationId) }, { session });
        if (!document)
          return Result.Error(ConversationErrorCode.ConversationNotFound);
        const conversation = mapConversation(document);
        if (!isMember({ conversation, actorId }))
          return Result.Error(ConversationErrorCode.ConversationForbidden);
        const window = historyWindow({
          range,
          lastSequence: conversation.lastSequence,
        });
        if (window.isError()) return Result.Error(window.getError());
        const { watermark } = window.get();
        return Result.Ok(
          await readMessagesPage({
            db,
            session,
            conversationId,
            range,
            watermark,
            limit,
          }),
        );
      }, transactionOptions);
    } finally {
      await session.endSession();
    }
  };
