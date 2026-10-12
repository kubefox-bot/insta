import type {
  CommonErrorCode,
  ConversationErrorCode,
  ConversationSuccessCode,
  MessageErrorCode,
} from "@insta/contracts/errors";

export type ConversationError =
  | ConversationErrorCode.SelfConversation
  | ConversationErrorCode.RecipientNotFound
  | ConversationErrorCode.ConversationNotFound
  | ConversationErrorCode.ConversationForbidden
  | CommonErrorCode.InvalidCursor
  | ConversationErrorCode.ConversationsRateLimited
  | CommonErrorCode.DependencyUnavailable;
export type Conversation = Readonly<{
  id: string;
  participantIds: readonly [string, string];
  lastSequence: number;
  lastActivityAt: number;
}>;
export type ConversationListItem = Readonly<
  Conversation & { unreadCount: number }
>;
export type ConversationList = Readonly<{
  items: readonly ConversationListItem[];
  totalUnreadCount: number;
}>;
export type Message = Readonly<{
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  sequence: number;
  createdAt: number;
  clientMessageId?: string;
  receipt?: import("./receipts/types").ReceiptState;
}>;
export type MessageError =
  | ConversationError
  | (
      | MessageErrorCode.InvalidMessage
      | MessageErrorCode.IdempotencyConflict
      | CommonErrorCode.OperationOutcomeUnknown
      | MessageErrorCode.MessagesRateLimited
    );
export type StartOutcome = Readonly<{
  conversation: Conversation;
  code:
    | ConversationSuccessCode.ConversationCreated
    | ConversationSuccessCode.ConversationReused;
}>;
