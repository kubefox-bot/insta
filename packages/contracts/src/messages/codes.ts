export enum ConversationErrorCode {
  SelfConversation = "SELF_CONVERSATION",
  RecipientNotFound = "RECIPIENT_NOT_FOUND",
  ConversationNotFound = "CONVERSATION_NOT_FOUND",
  ConversationForbidden = "CONVERSATION_FORBIDDEN",
  ConversationsRateLimited = "CONVERSATIONS_RATE_LIMITED",
}

export enum MessageErrorCode {
  InvalidMessage = "INVALID_MESSAGE",
  IdempotencyConflict = "IDEMPOTENCY_CONFLICT",
  MessagesRateLimited = "MESSAGES_RATE_LIMITED",
}

export enum ReceiptErrorCode {
  InvalidReceiptBatch = "INVALID_RECEIPT_BATCH",
  ReceiptsRateLimited = "RECEIPTS_RATE_LIMITED",
  ReceiptOutcomeUnknown = "RECEIPT_OUTCOME_UNKNOWN",
}

export enum ConversationSuccessCode {
  ConversationCreated = "CONVERSATION_CREATED",
  ConversationReused = "CONVERSATION_REUSED",
}
