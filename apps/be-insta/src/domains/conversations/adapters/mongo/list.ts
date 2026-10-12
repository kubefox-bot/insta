import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import type { ClientSession, Db } from "mongodb";
import { conversationPolicy } from "../../domain/policy";
import type { Conversations } from "../../ports/conversations";
import { collections, transactionOptions } from "./conts";
import { mapConversation } from "./mapper";
import { countUnread } from "./receipts/count-unread";
import type { ConversationDocument } from "./types";

/**
 * Читает согласованный snapshot всех бесед actor и общего unread, ограничивая только
 * возвращаемые items; сбой даёт DependencyUnavailable, собственная session закрывается в
 * finally.
 */
export const createUnreadList =
  ({
    db,
    startSession,
  }: Readonly<{
    db: Db;
    startSession: () => ClientSession;
  }>): Conversations["listUnread"] =>
  async ({ actorId, limit }) => {
    const session = startSession();
    try {
      return await session.withTransaction(
        async () => {
          const conversations = (
            await db
              .collection<ConversationDocument>(collections.conversations)
              .find({ participantIds: actorId }, { session })
              .sort({ lastActivityAt: -1, _id: -1 })
              .toArray()
          ).map(mapConversation);
          const ids = conversations.map(({ id }) => id);
          const counts = await countUnread({ db, session, ids, actorId });
          const byConversation = new Map(
            counts.map(({ _id, count }) => [_id, count]),
          );
          const totalUnreadCount = counts.reduce(
            (total, row) => total + row.count,
            0,
          );
          if (!Number.isSafeInteger(totalUnreadCount))
            throw new Error("Unread count exceeds safe integer");
          return Result.Ok({
            items: conversations.slice(0, limit).map((conversation) => ({
              ...conversation,
              unreadCount: byConversation.get(conversation.id) ?? 0,
            })),
            totalUnreadCount,
          });
        },
        {
          ...transactionOptions,
          timeoutMS: conversationPolicy.transactionTimeoutMs,
        },
      );
    } catch {
      return Result.Error(CommonErrorCode.DependencyUnavailable);
    } finally {
      await session.endSession();
    }
  };
