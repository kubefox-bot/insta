import { historyStates, olderWindowLimit } from "../conts";
import type { CachedHistory, HistoryQuery } from "../types";
/** Выбирает запрос ранней истории по серверному cursor либо ограниченному окну sequence; загрузка в процессе и достигнутое начало возвращают null. */
export const olderQuery = ({
  conversationId,
  history,
}: Readonly<{
  conversationId: string;
  history: CachedHistory;
}>): HistoryQuery | null => {
  if (history.status === historyStates.loading) return null;
  if (history.earlierCursor)
    return { conversationId, cursor: history.earlierCursor };
  const firstSequence = history.items[0]?.sequence ?? 0;
  return firstSequence > 1
    ? {
        conversationId,
        after: Math.max(0, firstSequence - olderWindowLimit - 1),
        limit: olderWindowLimit,
      }
    : null;
};
