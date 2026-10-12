import { Result } from "@bloodyowl/boxed";
import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { readOriginalReference } from "../../../../lib/observability/analytics/index";
import { conversationPolicy } from "../../domain/policy";
import type { CommitMessage } from "../../ports/commit-message";
import { transactionOptions } from "./conts";
import type { DeliveryRecordingOptions } from "./delivery/types";
import { commitWithinTransaction } from "./messages/commit";
import { readMessageIdentity } from "./messages/replay";
/**
 * Создаёт транзакционную запись сообщения с постоянным id для driver retries; после
 * ошибки ищет persisted identity, отсутствие доказательства оставляет unknown. Временную
 * session закрывает в finally.
 */
export const createCommitMessage =
  ({
    db,
    startSession,
    analyticsReference,
    clock,
    retentionMs,
  }: Readonly<{
    db: Db;
    startSession: () => ClientSession;
    analyticsReference?: () => ConsentReference | undefined;
  }> &
    DeliveryRecordingOptions): CommitMessage =>
  async (input) => {
    const messageId = new ObjectId();
    const session = startSession();
    const reference = readOriginalReference(analyticsReference);
    try {
      // Driver retries the complete callback on transient transaction errors and
      // commit only on unknown outcomes. IDs live outside the Mongo-only callback.
      const outcome = await session.withTransaction(
        () =>
          commitWithinTransaction({
            db,
            session,
            input,
            messageId,
            serverNowMs: clock(),
            retentionMs,
            ...(reference ? { reference } : {}),
          }),
        {
          ...transactionOptions,
          timeoutMS: conversationPolicy.transactionTimeoutMs,
        },
      );
      return Result.Ok(outcome);
    } catch {
      try {
        const persisted = await readMessageIdentity({ db, input, messageId });
        if (persisted) return Result.Ok(persisted);
      } catch {
        return Result.Error("unknown");
      }
      // An interrupted driver operation may have committed. Absence of persisted
      // evidence cannot prove failure, including a request without a replay key.
      return Result.Error("unknown");
    } finally {
      await session.endSession();
    }
  };
