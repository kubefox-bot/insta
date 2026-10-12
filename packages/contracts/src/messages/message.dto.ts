import { z } from "zod";
import { maxTextCodePoints } from "./conts";
import { wireIdSchema } from "./id.dto";
import { receiptStateSchema } from "./receipts.dto";

const messageTextPattern = `^(?:[^\\uD800-\\uDFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]){1,${maxTextCodePoints}}(?![\\s\\S])`;
const meaningfulMessagePattern = `^(?=[\\s\\S]*\\S)${messageTextPattern.slice(1)}`;
const textSchema = z.string().regex(new RegExp(messageTextPattern));
export const messageInputSchema = z.strictObject({
  text: z.string().regex(new RegExp(meaningfulMessagePattern)),
  clientMessageId: wireIdSchema.optional(),
});
export const messageSchema = z.strictObject({
  id: wireIdSchema,
  conversationId: wireIdSchema,
  authorId: wireIdSchema,
  clientMessageId: wireIdSchema.optional(),
  text: textSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.iso.datetime(),
  receipt: receiptStateSchema.optional(),
});
