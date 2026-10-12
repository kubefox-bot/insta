import type { Conversations } from "../../ports/conversations";
import type { Directory } from "../../ports/directory";
import type { ReadQuota } from "../../ports/quota/types";
export type ConversationsDependencies = Readonly<{
  conversations: Conversations;
  directory: Directory;
  quota: ReadQuota;
  operationId: () => string;
}>;

export type MessagesDependencies = Parameters<
  typeof import("../../use-cases/messages/send").sendMessage
>[1];
