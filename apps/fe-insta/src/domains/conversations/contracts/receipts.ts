import type { receiptBatchSnapshotSchema } from "@insta/contracts/messages";
import type { z } from "zod";
/** Проверяет принадлежность снимка диалогу и совпадение множества подтверждённых ID с запросом; порядок и повторы ID не учитываются. */
export const matchesReceiptBatch = ({
  snapshot,
  conversationId,
  messageIds,
}: Readonly<{
  snapshot: z.infer<typeof receiptBatchSnapshotSchema>;
  conversationId: string;
  messageIds: readonly string[];
}>) => {
  const requested = new Set(messageIds);
  return (
    snapshot.conversationId === conversationId &&
    snapshot.receipts.every(({ messageId }) => requested.has(messageId)) &&
    new Set(snapshot.receipts.map(({ messageId }) => messageId)).size ===
      requested.size
  );
};
