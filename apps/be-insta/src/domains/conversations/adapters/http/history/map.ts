import type { z } from "zod";
import { decodeCursor } from "../../../domain/history/cursor";
import type { HistoryRange } from "../../../domain/history/types";
import type { historyQuerySchema } from "./dto";
/**
 * Выбирает recent/after/before из проверенного query; cursor декодирует с привязкой к
 * conversationId, неверный cursor возвращает null.
 */
export const historyRange = ({
  input,
  conversationId,
}: Readonly<{
  input: z.infer<typeof historyQuerySchema>;
  conversationId: string;
}>): HistoryRange | null => {
  if (input.cursor !== undefined)
    return decodeCursor({
      value: input.cursor,
      conversationId: conversationId,
    });
  if (input.after !== undefined)
    return { direction: "after", sequence: input.after };
  return { direction: "recent" };
};

import type { History } from "../../../domain/history/types";
import { mapReceiptState } from "../../receipts/map";
/**
 * Переводит senderId в wire authorId, время сообщений и receipts в ISO-формат, сохраняя
 * метаданные страницы.
 */
export const mapHistory = (history: History) => ({
  ...history,
  items: history.items.map(({ senderId, createdAt, receipt, ...message }) => ({
    ...message,
    authorId: senderId,
    ...(receipt ? { receipt: mapReceiptState(receipt) } : {}),
    createdAt: new Date(createdAt).toISOString(),
  })),
});
