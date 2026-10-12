import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
  MessageErrorCode,
} from "@insta/contracts/errors";
import type { Actor } from "../../../users/index";
import { validMessageText } from "../../domain/messages/validate";
import type { Message, MessageError } from "../../domain/types";
import type { CommitMessage } from "../../ports/commit-message";
import type { MessageIdentity } from "../../ports/message-identity";
import type { ReadQuota } from "../../ports/quota/types";
/**
 * Проверяет текст и quota, выделяет event identities и передаёт запись атомарному
 * commit-порту; различает replay, conflict, отсутствие, запрет и неизвестный результат
 * операции.
 */
export const sendMessage = async (
  input: Readonly<{
    actor: Actor;
    conversationId: string;
    text: string;
    idempotencyKey?: string;
    clientMessageId?: string;
    operationId: string;
  }>,
  dependencies: Readonly<{
    commit: CommitMessage;
    identity: MessageIdentity;
    quota: ReadQuota;
    clock: () => number;
    uuid: () => string;
  }>,
): Promise<Result<Message, MessageError>> => {
  if (!validMessageText(input.text))
    return Result.Error(MessageErrorCode.InvalidMessage);
  const admission = await dependencies.quota.consume(input.actor.userId);
  if (admission.isError())
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  if (admission.get() === "limited")
    return Result.Error(MessageErrorCode.MessagesRateLimited);
  const result = await dependencies.commit({
    actorId: input.actor.userId,
    conversationId: input.conversationId,
    text: input.text,
    ...dependencies.identity({
      conversationId: input.conversationId,
      text: input.text,
      ...(input.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: input.idempotencyKey }),
    }),
    ...(input.clientMessageId === undefined
      ? {}
      : { clientMessageId: input.clientMessageId }),
    operationId: input.operationId,
    eventId: dependencies.uuid(),
    analyticsEventId: dependencies.uuid(),
    createdAt: dependencies.clock(),
  });
  if (result.isError())
    return Result.Error(
      result.getError() === "unknown"
        ? CommonErrorCode.OperationOutcomeUnknown
        : CommonErrorCode.DependencyUnavailable,
    );
  const outcome = result.get();
  switch (outcome.kind) {
    case "committed":
    case "replayed":
      return Result.Ok(outcome.message);
    case "conflict":
      return Result.Error(MessageErrorCode.IdempotencyConflict);
    case "forbidden":
      return Result.Error(ConversationErrorCode.ConversationForbidden);
    case "missing":
      return Result.Error(ConversationErrorCode.ConversationNotFound);
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
};
