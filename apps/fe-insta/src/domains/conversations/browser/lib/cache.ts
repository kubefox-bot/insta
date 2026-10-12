import { historyCachePolicy } from "../conts";
import type { CachedHistory } from "../types";
/** Возвращает новый ограниченный кеш, обновляя давность диалога и нужное окно сообщений. При обрезке начала latest-окна сбрасывает устаревший earlierCursor; входную Map не меняет. */
export const cacheHistory = ({
  current,
  conversationId,
  history,
  window = "latest",
}: Readonly<{
  current: ReadonlyMap<string, CachedHistory>;
  conversationId: string;
  history: CachedHistory;
  window?: "latest" | "earlier";
}>) => {
  const entries = new Map(current);
  entries.delete(conversationId);
  const items =
    window === "earlier"
      ? history.items.slice(0, historyCachePolicy.maxMessages)
      : history.items.slice(-historyCachePolicy.maxMessages);
  entries.set(conversationId, {
    ...history,
    items,
    earlierCursor:
      window === "latest" && items[0]?.id !== history.items[0]?.id
        ? null
        : history.earlierCursor,
  });
  while (entries.size > historyCachePolicy.maxConversations) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  return entries;
};
