import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
} from "@insta/contracts/errors";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { isMember } from "../../../domain/membership";
import type { ReceiptSnapshot } from "../../../domain/receipts/types";
import type { ReadReceipts } from "../../../ports/receipts";
import { collections, transactionOptions } from "../conts";
import { mapConversation } from "../mapper";
import { receiptCollections } from "./conts";
import { receiptDocumentSchema } from "./schema";
import type { ReceiptDocument } from "./types";
/** Internal page join: caller already owns membership validation in this session. */
export const readReceiptRows = async ({
  db,
  session,
  conversationId,
  messageIds,
}: Readonly<{
  db: Db;
  session: ClientSession;
  conversationId: string;
  messageIds: readonly string[];
}>): Promise<readonly ReceiptSnapshot[]> => {
  if (!messageIds.length) return [];
  const rows = await db
    .collection<ReceiptDocument>(receiptCollections.receipts)
    .find({ conversationId, messageId: { $in: [...messageIds] } }, { session })
    .toArray();
  return rows.map((row) => {
    const { messageId, recipientId, sequence, deliveredAt, readAt } =
      receiptDocumentSchema.parse(row);
    return { messageId, recipientId, sequence, deliveredAt, readAt };
  });
};
/**
 * Создаёт snapshot-чтение receipts после membership-проверки; signal проверяется при
 * входе в transaction callback, ошибки переводятся в DependencyUnavailable, session
 * закрывается в finally.
 */
export const createReadReceipts =
  ({
    db,
    startSession,
  }: Readonly<{ db: Db; startSession: () => ClientSession }>): ReadReceipts =>
  async (input) => {
    if (!ObjectId.isValid(input.conversationId))
      return Result.Error(ConversationErrorCode.ConversationNotFound);
    const session = startSession();
    try {
      return await session.withTransaction(async () => {
        input.signal?.throwIfAborted();
        const row = await db
          .collection(collections.conversations)
          .findOne({ _id: new ObjectId(input.conversationId) }, { session });
        if (!row)
          return Result.Error(ConversationErrorCode.ConversationNotFound);
        if (
          !isMember({
            actorId: input.actorId,
            conversation: mapConversation(row),
          })
        )
          return Result.Error(ConversationErrorCode.ConversationForbidden);
        return Result.Ok({
          conversationId: input.conversationId,
          receipts: await readReceiptRows({ db, session, ...input }),
        });
      }, transactionOptions);
    } catch {
      return Result.Error(CommonErrorCode.DependencyUnavailable);
    } finally {
      await session.endSession();
    }
  };
