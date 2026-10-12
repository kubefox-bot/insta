import { z } from "zod";
import { maxReceiptBatchIds, receiptStatuses } from "./conts";
import { wireIdSchema } from "./id.dto";

export const receiptStatusSchema = z.enum(receiptStatuses);
export const receiptStateSchema = z.strictObject({
  deliveredAt: z.iso.datetime().nullable(),
  readAt: z.iso.datetime().nullable(),
});
export const receiptSnapshotSchema = receiptStateSchema.extend({
  messageId: wireIdSchema,
  recipientId: wireIdSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export const receiptBatchSchema = z.strictObject({
  messageIds: z.array(wireIdSchema).min(1).max(maxReceiptBatchIds),
  status: receiptStatusSchema,
});
export const receiptBatchSnapshotSchema = z.strictObject({
  conversationId: wireIdSchema,
  receipts: z.array(receiptSnapshotSchema).max(maxReceiptBatchIds),
});
