import type { Conversation } from "../types";

/** Предпочитает имя получателя из диалога, включая явный null; только при отсутствии поля ищет другого участника в кеше каталога. */
export const resolveRecipientUsername = ({
  conversation,
  actorId,
  usernames,
}: Readonly<{
  conversation: Conversation;
  actorId: string;
  usernames?: ReadonlyMap<string, string>;
}>): string | null => {
  if (conversation.recipientUsername !== undefined)
    return conversation.recipientUsername;
  const recipientId = conversation.participantIds.find((id) => id !== actorId);
  return recipientId ? (usernames?.get(recipientId) ?? null) : null;
};
