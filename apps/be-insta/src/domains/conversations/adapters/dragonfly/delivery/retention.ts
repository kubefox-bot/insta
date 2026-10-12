import { readGeneration } from "@insta/fe-core/dragonfly/server";
import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
import { retainPages } from "./retention-turn";
import type { RetentionProgress, StreamsDependencies } from "./types";
/** Хранит не более одной SCAN страницы; сначала дорабатывает остаток, затем продолжает bounded обход. */
export const createRetention = (
  dependencies: StreamsDependencies,
): DeliveryStreams["retain"] => {
  const progress: RetentionProgress = {
    generation: "",
    cursor: "0",
    remainder: [],
  };
  return async ({ nowMs, signal }) => {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0)
      throw new Error("Invalid retention time");
    const current = await readGeneration({
      client: dependencies.client,
      namespace: dependencies.namespace,
    });
    if (current !== progress.generation) {
      progress.generation = current;
      progress.cursor = "0";
      progress.remainder = [];
    }
    await retainPages(
      { progress, nowMs, ...(signal ? { signal } : {}) },
      dependencies,
    );
  };
};
