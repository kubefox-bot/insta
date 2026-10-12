import { ObjectId } from "mongodb";
import { z } from "zod";
import { recoveryTargetSchema } from "../delivery/schema";

const snapshotSchema = z.strictObject({
  messageId: z.string(),
  recipientId: z.string(),
  sequence: z.number().int().positive(),
  deliveredAt: z.number().nullable(),
  readAt: z.number().nullable(),
});
export const receiptDocumentSchema = snapshotSchema.extend({
  _id: z.instanceof(ObjectId),
  conversationId: z.string(),
});
export const receiptEventSchema = z.strictObject({
  eventId: z.string(),
  createdAt: z.number(),
  conversationId: z.string(),
  receipts: z.array(snapshotSchema),
});
export const receiptOutboxSchema = receiptEventSchema.extend({
  _id: z.string(),
  state: z.enum(["pending", "delivered", "expired"]),
  recoveryExpiredAt: z.number().nonnegative().optional(),
  attempts: z.number().int().nonnegative(),
  leaseUntil: z.number(),
  leaseId: z.string().optional(),
  nextAttemptAt: z.number(),
  publishedAt: z.number().optional(),
  recoveryExpiresAt: z.date().optional(),
  recoveryTargets: z.array(recoveryTargetSchema).optional(),
});
