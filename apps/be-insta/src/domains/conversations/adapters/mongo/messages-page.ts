import type { ClientSession, Db } from "mongodb";
import { historyPage } from "../../domain/history/page";
import { historyPageLimit } from "../../domain/history/page-limit";
import type { HistoryRange } from "../../domain/history/types";
import { collections } from "./conts";
import { mapMessage } from "./mapper";
import { readReceiptRows } from "./receipts/read";
import type { MessageDocument } from "./types";

/**
 * Определяет Mongo-границы sequence и направление сортировки recent/after/before, всегда
 * ограничивая чтение watermark.
 */
const selectPosition = ({
  range,
  watermark,
}: Readonly<{ range: HistoryRange; watermark: number }>) => {
  switch (range.direction) {
    case "recent":
      return { position: { $lte: watermark }, sort: -1 as const };
    case "after":
      return {
        position: { $lte: watermark, $gt: range.sequence },
        sort: 1 as const,
      };
    case "before":
      return {
        position: { $lte: watermark, $lt: range.sequence },
        sort: -1 as const,
      };
  }
};
/**
 * Читает limit+1 для признака продолжения и присоединяет receipts только возвращаемых
 * сообщений в транзакции вызывающего; ресурс session не освобождает.
 */
export const readMessagesPage = async ({
  db,
  session,
  conversationId,
  range,
  watermark,
  limit,
}: Readonly<{
  db: Db;
  session: ClientSession;
  conversationId: string;
  range: HistoryRange;
  watermark: number;
  limit: number;
}>) => {
  const { position, sort } = selectPosition({ range, watermark });
  const pageLimit = historyPageLimit({ range, limit });
  const rows = await db
    .collection<MessageDocument>(collections.messages)
    .find({ conversationId, sequence: position }, { session })
    .sort({ sequence: sort })
    .limit(pageLimit + 1)
    .toArray();
  const page = historyPage({
    rows: rows.map(mapMessage),
    range,
    limit,
    conversationId,
    watermark,
  });
  const receipts = await readReceiptRows({
    db,
    session,
    conversationId,
    messageIds: page.items.map((message) => message.id),
  });
  const byMessage = new Map(
    receipts.map((receipt) => [receipt.messageId, receipt]),
  );
  return {
    ...page,
    items: page.items.map((message) => {
      const receipt = byMessage.get(message.id);
      return receipt
        ? {
            ...message,
            receipt: {
              deliveredAt: receipt.deliveredAt,
              readAt: receipt.readAt,
            },
          }
        : message;
    }),
  };
};
