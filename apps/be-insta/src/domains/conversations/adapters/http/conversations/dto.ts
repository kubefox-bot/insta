import {
  CommonErrorCode,
  ConversationErrorCode,
  ConversationSuccessCode,
} from "@insta/contracts/errors";
import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import { z } from "zod";
import { sequenceSchema } from "../../../domain/history/cursor";
import { conversationPolicy } from "../../../domain/policy";
export const identifierSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const startSchema = z.strictObject({ recipientId: identifierSchema });
export const listQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(conversationPolicy.maxListLimit)
    .default(conversationPolicy.defaultListLimit),
});
export const conversationSchema = z.strictObject({
  id: identifierSchema,
  participantIds: z.tuple([identifierSchema, identifierSchema]),
  lastSequence: sequenceSchema,
  lastActivityAt: z.number().int().nonnegative(),
});
export const conversationListItemSchema = conversationSchema.extend({
  recipientUsername: z.string().nullable(),
});
export const unreadConversationListItemSchema =
  conversationListItemSchema.extend({
    unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  });
export const startSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    conversation: conversationSchema,
    code: z.enum([
      ConversationSuccessCode.ConversationCreated,
      ConversationSuccessCode.ConversationReused,
    ]),
  }),
  meta: correlationSchema,
});
export const unreadListSuccessSchema = z.strictObject({
  ok: z.literal(true),
  meta: correlationSchema,
  data: z.strictObject({
    items: z.array(unreadConversationListItemSchema),
    totalUnreadCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  }),
});
export const conversationFailureSchema = z.strictObject({
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
      ]),
      message: z.string(),
    }),
  ]),
  meta: correlationSchema,
});
