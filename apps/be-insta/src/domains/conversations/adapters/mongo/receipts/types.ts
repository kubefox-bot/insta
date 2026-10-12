import type { ClientSession, Db } from "mongodb";
import type { z } from "zod";
import type { CommitReceipts } from "../../../ports/receipts";
import type { receiptDocumentSchema, receiptOutboxSchema } from "./schema";
export type ReceiptDocument = z.infer<typeof receiptDocumentSchema>;
export type ReceiptOutboxDocument = z.infer<typeof receiptOutboxSchema>;

export type ReceiptTransaction = Readonly<{
  db: Db;
  session: ClientSession;
  input: Parameters<CommitReceipts>[0];
  eventId: string;
  serverNowMs: number;
  retentionMs: number;
}>;
