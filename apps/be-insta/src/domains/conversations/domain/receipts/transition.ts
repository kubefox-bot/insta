import type { ReceiptState } from "./types";

/**
 * Монотонно добавляет delivered/read времена: read подразумевает delivered и не
 * предшествует ему; повтор возвращает исходное состояние без изменения времён.
 */
export const advanceReceipt = ({
  current,
  status,
  nowMs,
}: Readonly<{
  current: ReceiptState;
  status: "delivered" | "read";
  nowMs: number;
}>): ReceiptState => {
  switch (status) {
    case "delivered":
      if (current.deliveredAt !== null) return current;
      return { ...current, deliveredAt: nowMs };
    case "read": {
      if (current.readAt !== null) return current;
      const deliveredAt = current.deliveredAt ?? nowMs;
      return { deliveredAt, readAt: Math.max(deliveredAt, nowMs) };
    }
    default:
      return status satisfies never;
  }
};
