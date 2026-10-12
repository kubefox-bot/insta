import { messageInputSchema, wireIdSchema } from "@insta/contracts/messages";
import { z } from "zod";
import { conversationIdSchema } from "../../../../../contracts/schema";

const base = z.object({
  ownerId: wireIdSchema,
  conversationId: conversationIdSchema,
  text: messageInputSchema.shape.text,
  key: wireIdSchema,
  clientMessageId: wireIdSchema,
  operationId: wireIdSchema,
  createdAt: z.number().finite(),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.number().finite(),
  lastAuthGeneration: wireIdSchema,
  revision: z.number().int().nonnegative(),
  manualAttempt: z.boolean(),
});
export const persistedRecordSchema = z.discriminatedUnion("state", [
  base.extend({
    state: z.literal("queued"),
    needsConfirmation: z.literal(false),
  }),
  base.extend({
    state: z.literal("confirmation"),
    needsConfirmation: z.literal(true),
  }),
  base.extend({
    state: z.literal("terminal"),
    needsConfirmation: z.literal(false),
    errorCode: z.string(),
  }),
]);
