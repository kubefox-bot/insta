import { Result } from "@bloodyowl/boxed";
import {
  ConversationErrorCode,
  ReceiptErrorCode,
} from "@insta/contracts/errors";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { conversationPolicy } from "../../../domain/policy";
import type { CommitReceipts } from "../../../ports/receipts";
import { transactionOptions } from "../conts";
import type { DeliveryRecordingOptions } from "../delivery/types";
import { commitReceiptTransaction } from "./transaction";
/**
 * Создаёт транзакционное подтверждение receipts с одним eventId для driver retries;
 * исключение означает ReceiptOutcomeUnknown, собственная session всегда закрывается.
 */
export const createCommitReceipts =
  ({
    db,
    startSession,
    clock,
    retentionMs,
  }: Readonly<{ db: Db; startSession: () => ClientSession }> &
    DeliveryRecordingOptions): CommitReceipts =>
  async (input) => {
    if (!ObjectId.isValid(input.conversationId))
      return Result.Error(ConversationErrorCode.ConversationNotFound);
    if (input.messageIds.some((id) => !ObjectId.isValid(id)))
      return Result.Error(ReceiptErrorCode.InvalidReceiptBatch);
    const eventId = crypto.randomUUID();
    const session = startSession();
    try {
      return await session.withTransaction(
        () =>
          commitReceiptTransaction({
            db,
            session,
            input,
            eventId,
            serverNowMs: clock(),
            retentionMs,
          }),
        {
          ...transactionOptions,
          timeoutMS: conversationPolicy.transactionTimeoutMs,
        },
      );
    } catch {
      // An interrupted commit can already be durable. A replay re-reads the
      // authoritative records and emits only actual monotonic changes.
      return Result.Error(ReceiptErrorCode.ReceiptOutcomeUnknown);
    } finally {
      await session.endSession();
    }
  };
