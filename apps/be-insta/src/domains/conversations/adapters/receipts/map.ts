import type {
  ReceiptBatchSnapshot,
  ReceiptState,
} from "../../domain/receipts/types";
/**
 * Переводит известные receipt timestamps в ISO-строки, сохраняя null как отсутствие
 * подтверждения.
 */
export const mapReceiptState = (receipt: ReceiptState) => ({
  deliveredAt:
    receipt.deliveredAt === null
      ? null
      : new Date(receipt.deliveredAt).toISOString(),
  readAt:
    receipt.readAt === null ? null : new Date(receipt.readAt).toISOString(),
});
/**
 * Строит wire snapshot пачки receipts с ISO-временем без изменения исходных доменных
 * записей.
 */
export const mapReceiptSnapshot = (snapshot: ReceiptBatchSnapshot) => ({
  conversationId: snapshot.conversationId,
  receipts: snapshot.receipts.map((receipt) => ({
    ...receipt,
    ...mapReceiptState(receipt),
  })),
});
