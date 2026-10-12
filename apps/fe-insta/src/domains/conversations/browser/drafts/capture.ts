import type { ConversationActor, ConversationView } from "../types";

/** Находит текст и второго участника выбранного диалога только при совпадении actor с владельцем; отсутствие текста или получателя не создаёт снимок. */
export const captureDraft = ({
  snapshot,
  contents,
  owner,
}: Readonly<{
  snapshot: ConversationView;
  contents: ReadonlyMap<string, string>;
  owner: ConversationActor | null;
}>) => {
  const { actor, selectedId } = snapshot;
  if (
    !actor ||
    !selectedId ||
    actor.userId !== owner?.userId ||
    actor.generation !== owner.generation
  )
    return;
  const recipientId = snapshot.conversations
    .find((item) => item.id === selectedId)
    ?.participantIds.find((id) => id !== actor.userId);
  const text = contents.get(selectedId);
  return recipientId && text ? { actor, recipientId, text } : undefined;
};
