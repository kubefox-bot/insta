import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
} from "@insta/contracts/errors";
import type { Actor } from "../../../users/index";
import type { History, HistoryRange } from "../../domain/history/types";
import type { ConversationError } from "../../domain/types";
import type { Conversations } from "../../ports/conversations";
import type { ReadQuota } from "../../ports/quota/types";
/**
 * Расходует read quota actor перед запросом истории; различает unavailable и rate limit,
 * membership/snapshot чтение делегирует conversation-порту.
 */
export const listHistory = async (
  input: Readonly<{
    actor: Actor;
    conversationId: string;
    range: HistoryRange;
    limit: number;
  }>,
  dependencies: Readonly<{ conversations: Conversations; quota: ReadQuota }>,
): Promise<Result<History, ConversationError>> => {
  const admission = await dependencies.quota.consume(input.actor.userId);
  if (admission.isError())
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  if (admission.get() === "limited")
    return Result.Error(ConversationErrorCode.ConversationsRateLimited);
  return dependencies.conversations.history({
    actorId: input.actor.userId,
    conversationId: input.conversationId,
    range: input.range,
    limit: input.limit,
  });
};
