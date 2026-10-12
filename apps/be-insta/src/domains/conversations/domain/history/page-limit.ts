import { historyPolicy } from "./conts";
import type { HistoryRange } from "./types";
/**
 * Для начального recent snapshot выбирает фиксированный размер политики; для
 * направленного чтения использует переданный limit.
 */
export const historyPageLimit = ({
  range,
  limit,
}: Readonly<{ range: HistoryRange; limit: number }>): number => {
  switch (range.direction) {
    case "recent":
      return historyPolicy.initialHistoryLimit;
    case "after":
    case "before":
      return limit;
  }
};
