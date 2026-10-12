import { ConversationErrorCode } from "@insta/contracts/errors";
export const unavailableTargetCodes: readonly string[] = [
  ConversationErrorCode.RecipientNotFound,
  ConversationErrorCode.ConversationForbidden,
  ConversationErrorCode.SelfConversation,
];
