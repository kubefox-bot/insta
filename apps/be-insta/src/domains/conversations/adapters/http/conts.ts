import {
  CommonErrorCode,
  ConversationErrorCode,
  MessageErrorCode,
  ReceiptErrorCode,
} from "@insta/contracts/errors";

import type { ReceiptError } from "../../domain/receipts/types";
import type { MessageError } from "../../domain/types";
export const conversationsDependenciesToken = "CONVERSATIONS_DEPENDENCIES";
export const messagesDependenciesToken = "MESSAGES_DEPENDENCIES";
export const conversationErrorStatus = {
  [ConversationErrorCode.SelfConversation]: 400,
  [ConversationErrorCode.RecipientNotFound]: 404,
  [ConversationErrorCode.ConversationNotFound]: 404,
  [ConversationErrorCode.ConversationForbidden]: 403,
  [CommonErrorCode.InvalidCursor]: 400,
  [ConversationErrorCode.ConversationsRateLimited]: 429,
  [CommonErrorCode.DependencyUnavailable]: 503,
  [MessageErrorCode.InvalidMessage]: 400,
  [MessageErrorCode.IdempotencyConflict]: 409,
  [CommonErrorCode.OperationOutcomeUnknown]: 503,
  [MessageErrorCode.MessagesRateLimited]: 429,
  [ReceiptErrorCode.InvalidReceiptBatch]: 400,
  [ReceiptErrorCode.ReceiptsRateLimited]: 429,
  [ReceiptErrorCode.ReceiptOutcomeUnknown]: 503,
} as const satisfies Record<MessageError | ReceiptError, number>;
export const messageErrorStatus = conversationErrorStatus;
export const maxCursorLength = 1024;
export const retryAfterSeconds = 60;
export const unsignedDecimalPattern = /^[0-9]+$/;
