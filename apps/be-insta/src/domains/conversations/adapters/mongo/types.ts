import type { z } from "zod";
import type {
  conversationDocumentSchema,
  messageDocumentSchema,
} from "./schema";
export type ConversationDocument = z.infer<typeof conversationDocumentSchema>;
export type MessageDocument = z.infer<typeof messageDocumentSchema>;

export type MessageIdentityDocument = {
  _id: string;
  actorId: string;
  conversationId: string;
  messageId: string;
  fingerprint: string;
  keyDigest?: string;
};

export type OutboxDocument = z.infer<
  typeof import("./outbox-schema").outboxDocumentSchema
>;
