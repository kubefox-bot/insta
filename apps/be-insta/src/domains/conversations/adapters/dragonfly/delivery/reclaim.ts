import { readGeneration } from "@insta/fe-core/dragonfly/server";
import { reclaimPolicy } from "./conts";
import { reclaimPage } from "./reclaim-page";
import type { StreamsDependencies } from "./types";
/** Ведёт bounded SCAN progress у adapter owner; каждый пакет удаления повторно проверяет physical fence. */
export const createGenerationReclaimer = (
  dependencies: StreamsDependencies,
) => {
  let generation = "";
  let cursor = "0";
  let nextScanAt = 0;
  let pending: Promise<void> | undefined;
  /** Выполняет ограниченный maintenance turn; незавершённый обход остаётся retryable, а не ready. */
  const scan = async (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const current = await readGeneration({
      client: dependencies.client,
      namespace: dependencies.namespace,
    });
    if (current !== generation) {
      generation = current;
      cursor = "0";
      nextScanAt = 0;
    }
    if (dependencies.clock() < nextScanAt) return;
    for (let page = 0; page < reclaimPolicy.pagesPerTurn; page += 1) {
      signal?.throwIfAborted();
      cursor = await reclaimPage({ cursor, generation: current }, dependencies);
      signal?.throwIfAborted();
      if (cursor === "0") {
        nextScanAt = dependencies.clock() + reclaimPolicy.intervalMs;
        return;
      }
    }
    throw new Error("DELIVERY_GENERATION_CLEANUP_PENDING");
  };
  return async (signal?: AbortSignal) => {
    if (!pending)
      pending = scan(signal).finally(() => {
        pending = undefined;
      });
    await pending;
    signal?.throwIfAborted();
  };
};
