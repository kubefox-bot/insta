import type { Actor, ConversationTarget } from "../../../domain/types";
import { unavailableTargetCodes } from "./conts";
import type { ConversationTargetSource } from "./types";
/**
 * Разрешает разговор с другим адресатом через start и проверяет обоих участников; известная
 * недоступность цели даёт undefined, отказ провайдера остаётся исключением.
 */
export const resolveConversationTarget = async ({
  type,
  recipientId,
  actor,
  start,
}: Readonly<{
  type: ConversationTarget["type"];
  recipientId?: string;
  actor: Actor;
  start: ConversationTargetSource["start"];
}>): Promise<ConversationTarget | undefined> => {
  if (!recipientId || recipientId === actor.userId) return undefined;
  const result = await start({ recipientId, actor });
  if (result.isError()) {
    if (unavailableTargetCodes.includes(result.getError().code))
      return undefined;
    throw new Error("Conversation target provider unavailable");
  }
  const conversation = result.get();
  if (
    !conversation.participantIds.includes(actor.userId) ||
    !conversation.participantIds.includes(recipientId)
  )
    return undefined;
  return { type, conversationId: conversation.id };
};
