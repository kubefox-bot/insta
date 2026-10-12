import {
  CommonErrorCode,
  ConversationErrorCode,
  MessageErrorCode,
} from "@insta/contracts/errors";
import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import { messageInputSchema, messageSchema } from "@insta/contracts/messages";
import { z } from "zod";

export const sendSchema = messageInputSchema;
export const messageSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: messageSchema,
  meta: correlationSchema,
});
export const messageFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: z.union([
    validationErrorSchema,
    internalErrorSchema,
    z.strictObject({
      code: z.enum([
        ConversationErrorCode.SelfConversation,
        ConversationErrorCode.RecipientNotFound,
        ConversationErrorCode.ConversationNotFound,
        ConversationErrorCode.ConversationForbidden,
        CommonErrorCode.InvalidCursor,
        ConversationErrorCode.ConversationsRateLimited,
        CommonErrorCode.DependencyUnavailable,

        MessageErrorCode.InvalidMessage,
        MessageErrorCode.IdempotencyConflict,
        CommonErrorCode.OperationOutcomeUnknown,
        MessageErrorCode.MessagesRateLimited,
      ]),
      message: z.string(),
    }),
  ]),
  meta: correlationSchema,
});
