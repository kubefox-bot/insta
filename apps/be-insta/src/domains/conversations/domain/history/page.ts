import type { Message } from "../types";
import { historyPolicy } from "./conts";
import { encodeCursor } from "./cursor";
import { historyPageLimit } from "./page-limit";
import type { History, HistoryRange } from "./types";
/**
 * Собирает хронологическую страницу и cursor из limit+1 rows, не меняя вход; неполный
 * recent snapshot отклоняет, watermark сохраняет между страницами.
 */
export const historyPage = ({
  rows,
  range,
  limit,
  conversationId,
  watermark,
}: Readonly<{
  rows: ReadonlyArray<Message>;
  range: HistoryRange;
  limit: number;
  conversationId: string;
  watermark: number;
}>): History => {
  const pageLimit = historyPageLimit({ range, limit });
  const selected = rows.slice(0, pageLimit);
  if (
    range.direction === "recent" &&
    selected.length !== Math.min(watermark, pageLimit)
  )
    throw new Error("Incomplete initial history snapshot");
  const items =
    range.direction === "after" ? selected : [...selected].reverse();
  const hasMore = rows.length > pageLimit;
  const direction = range.direction === "after" ? "after" : "before";
  const boundary = direction === "after" ? items.at(-1) : items.at(0);
  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && boundary
          ? encodeCursor({
              direction,
              conversationId,
              sequence: boundary.sequence,
              watermark,
            })
          : null,
    },
    baselineCursor:
      range.direction === "after"
        ? range.sequence
        : Math.max(0, watermark - historyPolicy.initialHistoryLimit),
    watermark,
  };
};
