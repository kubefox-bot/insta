import type {
  AcknowledgeReceiptsInput,
  ReceiptBatchWireSnapshot,
} from "../types";
/** Разрешает уведомление о подтверждённом чтении лишь для read-запроса со снимком, содержащим хотя бы одну дату чтения. */
export const isReadAcknowledged = (
  input: Readonly<{
    request: AcknowledgeReceiptsInput;
    snapshot: ReceiptBatchWireSnapshot;
  }>,
) =>
  input.request.status === "read" &&
  input.snapshot.receipts.some((receipt) => receipt.readAt !== null);
