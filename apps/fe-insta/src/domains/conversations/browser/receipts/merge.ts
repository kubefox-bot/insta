import type { ReceiptWireSnapshot, ReceiptWireState } from "./types";
/** Заполняет отсутствующие даты доставки и чтения, сохраняя уже известные даты при устаревших снимках. */
export const mergeReceiptState = ({
  current,
  incoming,
}: Readonly<{
  current: ReceiptWireState | undefined;
  incoming: ReceiptWireState | undefined;
}>): ReceiptWireState | undefined => {
  if (!current)
    return incoming
      ? { deliveredAt: incoming.deliveredAt, readAt: incoming.readAt }
      : undefined;
  return {
    deliveredAt: current.deliveredAt ?? incoming?.deliveredAt ?? null,
    readAt: current.readAt ?? incoming?.readAt ?? null,
  };
};
/** Объединяет снимки по messageId монотонно; несовпадение получателя или sequence считается конфликтом идентичности. */
export const mergeReceiptSnapshots = ({
  current,
  incoming,
}: Readonly<{
  current: readonly ReceiptWireSnapshot[];
  incoming: readonly ReceiptWireSnapshot[];
}>): readonly ReceiptWireSnapshot[] => {
  const snapshots = new Map<string, ReceiptWireSnapshot>();
  for (const receipt of [...current, ...incoming]) {
    const previous = snapshots.get(receipt.messageId);
    if (
      previous &&
      (previous.recipientId !== receipt.recipientId ||
        previous.sequence !== receipt.sequence)
    )
      throw new Error("Conflicting receipt identity");
    const state = mergeReceiptState({ current: previous, incoming: receipt });
    snapshots.set(receipt.messageId, { ...receipt, ...state });
  }
  return [...snapshots.values()];
};
