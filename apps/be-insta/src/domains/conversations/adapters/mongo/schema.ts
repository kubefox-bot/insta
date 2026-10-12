import { ObjectId } from "mongodb";
import { z } from "zod";
import { sequenceSchema } from "../../domain/history/cursor";
export const conversationDocumentSchema = z.strictObject({
  _id: z.instanceof(ObjectId),
  participantIds: z.tuple([z.string(), z.string()]),
  pairKey: z.string(),
  lastSequence: sequenceSchema,
  lastActivityAt: z.date(),
  createdAt: z.date(),
});
export const messageDocumentSchema = z.strictObject({
  _id: z.instanceof(ObjectId),
  conversationId: z.string(),
  senderId: z.string(),
  clientMessageId: z.string().optional(),
  text: z.string(),
  sequence: sequenceSchema.refine((sequence) => sequence > 0),
  createdAt: z.date(),
});
