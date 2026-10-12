import type { Result as Outcome } from "@bloodyowl/boxed";
import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
} from "@insta/contracts/errors";
import type { Actor } from "../../../users/index";
import type {
  ConversationError,
  ConversationListItem,
} from "../../domain/types";
import type { Conversations } from "../../ports/conversations";
import type { Directory } from "../../ports/directory";
import type { ReadQuota } from "../../ports/quota/types";
import { enrichRecipients } from "../lib/enrich-recipients";

/**
 * После read quota получает согласованные unread counts и обогащает items username
 * собеседников, сохраняя общий totalUnreadCount хранилища.
 */
export const listUnreadConversations = async (
  input: Readonly<{ actor: Actor; limit: number }>,
  dependencies: Readonly<{
    conversations: Conversations;
    directory: Directory;
    quota: ReadQuota;
  }>,
): Promise<
  Outcome<
    Readonly<{
      items: readonly Readonly<
        ConversationListItem & { recipientUsername: string | null }
      >[];
      totalUnreadCount: number;
    }>,
    ConversationError
  >
> => {
  const admission = await dependencies.quota.consume(input.actor.userId);
  if (admission.isError())
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  if (admission.get() === "limited")
    return Result.Error(ConversationErrorCode.ConversationsRateLimited);
  const result = await dependencies.conversations.listUnread({
    actorId: input.actor.userId,
    limit: input.limit,
  });
  if (result.isError()) return Result.Error(result.getError());
  const { items, totalUnreadCount } = result.get();
  const enriched = await enrichRecipients({
    conversations: items,
    actorId: input.actor.userId,
    directory: dependencies.directory,
  });
  if (enriched.isError()) return Result.Error(enriched.getError());
  return Result.Ok({ items: enriched.get(), totalUnreadCount });
};
