import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
  DirectoryErrorCode,
} from "@insta/contracts/errors";
import type { Actor } from "../../../users/index";
import type { ConversationError, StartOutcome } from "../../domain/types";
import type { Conversations } from "../../ports/conversations";
import type { Directory } from "../../ports/directory";
/**
 * Запрещает диалог с собой и проверяет публичного active-получателя; затем создаёт либо
 * переиспользует пару, различая отсутствие получателя и отказ directory.
 */
export const startConversation = async (
  input: Readonly<{ actor: Actor; recipientId: string; operationId: string }>,
  dependencies: Readonly<{
    directory: Directory;
    conversations: Conversations;
  }>,
): Promise<Result<StartOutcome, ConversationError>> => {
  if (input.actor.userId === input.recipientId)
    return Result.Error(ConversationErrorCode.SelfConversation);
  const recipient = await dependencies.directory.findPublicUser({
    id: input.recipientId,
  });
  if (recipient.isError())
    return Result.Error(
      recipient.getError() === DirectoryErrorCode.UserNotFound
        ? ConversationErrorCode.RecipientNotFound
        : CommonErrorCode.DependencyUnavailable,
    );
  return dependencies.conversations.startPair({
    participantIds: [input.actor.userId, recipient.get().id],
    operationId: input.operationId,
  });
};
