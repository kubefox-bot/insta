import {
  CommonErrorCode,
  ConversationErrorCode,
  ReceiptErrorCode,
} from "@insta/contracts/errors";
import {
  correlationSchema,
  internalErrorSchema,
  validationErrorSchema,
} from "@insta/contracts/http";
import {
  receiptBatchSchema,
  receiptBatchSnapshotSchema,
} from "@insta/contracts/messages";
import { z } from "zod";

export const receiptInputSchema = receiptBatchSchema;
export const receiptSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: receiptBatchSnapshotSchema,
  meta: correlationSchema,
});
export const receiptFailureSchema = z.strictObject({
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

        ReceiptErrorCode.InvalidReceiptBatch,
        ReceiptErrorCode.ReceiptsRateLimited,
        ReceiptErrorCode.ReceiptOutcomeUnknown,
      ]),
      message: z.string(),
    }),
  ]),
  meta: correlationSchema,
});
