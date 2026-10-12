import { retentionPolicy } from "./conts";
import { drainRetentionPage } from "./retention-page";
import { scanOwnedPage } from "./scan";
import type { RetentionProgress, StreamsDependencies } from "./types";
/** Ограничивает обход страницами и streams; сохранённый остаток всегда обрабатывается до нового SCAN. */
export const retainPages = async (
  {
    progress,
    nowMs,
    signal,
  }: Readonly<{
    progress: RetentionProgress;
    nowMs: number;
    signal?: AbortSignal;
  }>,
  dependencies: StreamsDependencies,
) => {
  const turn = {
    nowMs,
    ...(signal ? { signal } : {}),
    visited: new Set<string>(),
  };
  for (let pages = 0; pages < retentionPolicy.pagesPerTurn; pages += 1) {
    signal?.throwIfAborted();
    if (turn.visited.size >= retentionPolicy.streamsPerTurn) return;
    if (!progress.remainder.length) {
      const [next, keys] = await scanOwnedPage(progress.cursor, dependencies);
      progress.cursor = next;
      progress.remainder = keys;
    }
    await drainRetentionPage({ progress, turn }, dependencies);
    if (progress.remainder.length || progress.cursor === "0") return;
  }
};
