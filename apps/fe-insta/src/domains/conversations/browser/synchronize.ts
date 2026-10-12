import { verifiedContinuity } from "./lib/continuity";
import type { Message, SyncDependencies, SyncResult } from "./types";
/** Подписывается до чтения истории и буферизует realtime до слияния, затем проверяет непрерывность курсора. При успехе передаёт release вызывающему владельцу, при ошибке освобождает подписку сам. */
export const synchronize = async (
  {
    conversationId,
    verifiedCursor,
  }: Readonly<{ conversationId: string; verifiedCursor: number | null }>,
  dependencies: SyncDependencies,
): Promise<SyncResult> => {
  const buffered: Message[] = [];
  let live = false;
  const release = await dependencies.subscribe(conversationId, (message) => {
    if (message.conversationId !== conversationId) return;
    if (live) dependencies.onLive?.(message);
    else buffered.push(message);
  });
  try {
    const initialQuery =
      verifiedCursor === null
        ? { conversationId }
        : { conversationId, after: verifiedCursor };
    const first = await dependencies.history(initialQuery);
    let items = first.items;
    let next = first.pageInfo;
    while (verifiedCursor !== null && next.hasMore && next.nextCursor) {
      const page = await dependencies.history({
        conversationId,
        cursor: next.nextCursor,
      });
      items = dependencies.merge({ current: items, incoming: page.items });
      next = page.pageInfo;
    }
    const merged = dependencies.merge({ current: items, incoming: buffered });
    live = true;
    return {
      items: merged,
      earlierCursor: verifiedCursor === null ? first.pageInfo.nextCursor : null,
      verifiedCursor: verifiedContinuity({
        baseline: verifiedCursor ?? first.baselineCursor,
        items: merged,
      }),
      release,
    };
  } catch (error) {
    await release();
    throw error;
  }
};
