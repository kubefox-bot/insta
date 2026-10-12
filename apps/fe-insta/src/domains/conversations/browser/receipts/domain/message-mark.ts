import type { Message } from "../../types";
import type { ReceiptWireState } from "../types";
import type { MessageMarkState } from "./types";
/** Выбирает отметку сообщения с приоритетом чтения над доставкой; для ещё не сохранённого сообщения показывает терминальную ошибку либо ожидание. */
export const messageMarkState = ({
  message,
  receipt = message?.receipt,
  queuedRecord,
}: Readonly<{
  message?: Message;
  receipt?: ReceiptWireState;
  queuedRecord?: Readonly<{ state: string; errorCode?: string }>;
}>): MessageMarkState => {
  if (message) {
    if (receipt?.readAt) return { kind: "read", timestamp: receipt.readAt };
    if (receipt?.deliveredAt)
      return { kind: "delivered", timestamp: receipt.deliveredAt };
    return { kind: "sent" };
  }
  if (queuedRecord?.state === "terminal" && queuedRecord.errorCode)
    return { kind: "error", code: queuedRecord.errorCode };
  return { kind: "waiting" };
};
