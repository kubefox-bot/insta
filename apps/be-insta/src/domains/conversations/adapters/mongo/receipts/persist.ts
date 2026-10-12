import type { ClientSession, Db } from "mongodb";
import { advanceReceipt } from "../../../domain/receipts/transition";
import type { ReceiptSnapshot } from "../../../domain/receipts/types";
import type { Message } from "../../../domain/types";
import type { CommitReceipts } from "../../../ports/receipts";
import { receiptCollections } from "./conts";
import { receiptDocumentSchema } from "./schema";
import type { ReceiptDocument } from "./types";
/**
 * Последовательно применяет монотонные receipts в транзакции вызывающего; возвращает все
 * snapshots и отдельно фактические изменения, не перезаписывая неизменившиеся записи.
 */
export const persistReceiptChanges = async ({
  db,
  session,
  input,
  messages,
}: Readonly<{
  db: Db;
  session: ClientSession;
  input: Parameters<CommitReceipts>[0];
  messages: readonly Message[];
}>) => {
  const records = db.collection<ReceiptDocument>(receiptCollections.receipts);
  const snapshots: ReceiptSnapshot[] = [];
  const changed: ReceiptSnapshot[] = [];
  for (const message of messages) {
    const filter = { messageId: message.id, recipientId: input.actorId };
    const row = await records.findOne(filter, { session });
    const current = row
      ? receiptDocumentSchema.parse(row)
      : { deliveredAt: null, readAt: null };
    const next = advanceReceipt({
      current,
      status: input.status,
      nowMs: input.nowMs,
    });
    const snapshot = {
      ...filter,
      sequence: message.sequence,
      deliveredAt: next.deliveredAt,
      readAt: next.readAt,
    };
    snapshots.push(snapshot);
    if (
      current.deliveredAt === next.deliveredAt &&
      current.readAt === next.readAt
    )
      continue;
    await records.updateOne(
      filter,
      { $set: { ...snapshot, conversationId: input.conversationId } },
      { session, upsert: true },
    );
    changed.push(snapshot);
  }
  return { snapshots, changed };
};
