import { readGeneration } from "@insta/fe-core/dragonfly/server";
import type { StreamNotice } from "../../../ports/delivery/types";
import { inspectStream } from "./read";
import type { ReaderEntry, StreamsDependencies } from "./types";
/** Проверяет только Dragonfly generation/continuity и уведомляет каждого владельца один раз на изменение диапазона. */
export const notifyReaders = async (
  entry: ReaderEntry,
  previousGeneration: string,
  dependencies: StreamsDependencies,
) => {
  const generation = await readGeneration({
    client: dependencies.client,
    namespace: dependencies.namespace,
  });
  const state = await inspectStream(
    { after: entry.after, signal: entry.controller.signal },
    dependencies,
  );
  const changed =
    previousGeneration !== "" && previousGeneration !== generation;
  const revision =
    state.kind === "ready"
      ? `${generation}:${state.after.cursor}:${state.head.cursor}`
      : `${generation}:gap`;
  const availability: StreamNotice =
    state.kind === "gap" ? { kind: "integrity-lost" } : { kind: "available" };
  const notice: StreamNotice = changed
    ? { kind: "generation-changed" }
    : availability;
  for (const [id, watcher] of entry.watchers) {
    if (watcher.revision === revision && !changed) continue;
    watcher.revision = revision;
    try {
      await watcher.onAvailable(notice);
    } catch (error) {
      entry.watchers.delete(id);
      watcher.finish(error);
    }
  }
  return generation;
};
