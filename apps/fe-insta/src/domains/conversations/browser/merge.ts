import { mergeReceiptState } from "./receipts/merge";
import type { Message } from "./types";
/** Объединяет сообщения по ID, монотонно сливая receipt и сортируя по sequence. Конфликт sequence или идентичности сообщения выбрасывает ошибку; входные массивы не меняются. */
export const mergeMessages = ({
  current,
  incoming,
}: Readonly<{
  current: readonly Message[];
  incoming: readonly Message[];
}>): readonly Message[] => {
  const ids = new Map<string, Message>();
  const sequences = new Map<number, string>();
  for (const message of [...current, ...incoming]) {
    const previous = sequences.get(message.sequence);
    if (previous && previous !== message.id)
      throw new Error("Conflicting message sequence");
    const existing = ids.get(message.id);
    if (
      existing &&
      (existing.sequence !== message.sequence ||
        existing.conversationId !== message.conversationId)
    )
      throw new Error("Conflicting message identity");
    const receipt = mergeReceiptState({
      current: existing?.receipt,
      incoming: message.receipt,
    });
    ids.set(message.id, receipt ? { ...message, receipt } : message);
    sequences.set(message.sequence, message.id);
  }
  return [...ids.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
};
