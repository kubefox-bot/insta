import { ConversationSuccessCode } from "@insta/contracts/errors";
import {
  messageSchema,
  receiptBatchSnapshotSchema,
} from "@insta/contracts/messages";
import { z } from "zod";
export const conversationIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const conversationSchema = z.strictObject({
  id: conversationIdSchema,
  participantIds: z.tuple([z.string(), z.string()]),
  lastSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastActivityAt: z.number().int().nonnegative(),
  recipientUsername: z.string().nullable().optional(),
  unreadCount: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});
export const historySchema = z.strictObject({
  items: z.array(messageSchema),
  baselineCursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  watermark: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pageInfo: z.strictObject({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});
export const listSchema = z.strictObject({
  totalUnreadCount: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  items: z.array(
    conversationSchema.extend({
      recipientUsername: z.string().nullable(),
    }),
  ),
});
export const startSchema = z.strictObject({
  conversation: conversationSchema,
  code: z.enum([
    ConversationSuccessCode.ConversationCreated,
    ConversationSuccessCode.ConversationReused,
  ]),
});
export const unreadListSchema = listSchema
  .required({ totalUnreadCount: true })
  .extend({
    items: z.array(
      listSchema.shape.items.element.required({ unreadCount: true }),
    ),
  });
export const receiptReplySchema = z.object({
  ok: z.literal(true),
  data: receiptBatchSnapshotSchema,
});
