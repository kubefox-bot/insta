import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
import { runReader } from "./reader-loop";
import type { ReaderEntry, ReaderRegistry, StreamsDependencies } from "./types";

/** Регистрирует owner общего reader до первого await и распределяет settlement по остающимся подписчикам. */
const createEntry = (
  input: Parameters<DeliveryStreams["watch"]>[0],
  registry: ReaderRegistry,
  dependencies: StreamsDependencies,
) => {
  const key = input.after.streamId;
  const entry: ReaderEntry = {
    controller: new AbortController(),
    watchers: new Map(),
    after: input.after,
    stream: input.stream,
    task: Promise.resolve(),
  };
  registry.entries.set(key, entry);
  entry.task = runReader(entry, dependencies)
    .catch((error) => {
      for (const watcher of entry.watchers.values()) watcher.finish(error);
    })
    .finally(() => {
      registry.entries.delete(key);
      for (const watcher of entry.watchers.values()) watcher.finish();
    });
  return entry;
};
/** Отдельная подписка ждёт reader cleanup только если уходит последней; borrowed command client остаётся жив. */
export const subscribeReader = async (
  input: Parameters<DeliveryStreams["watch"]>[0],
  registry: ReaderRegistry,
  dependencies: StreamsDependencies,
) => {
  input.signal.throwIfAborted();
  if (registry.closed) throw new Error("Delivery readers closed");
  const key = `${input.stream.kind}:${input.stream.id}`;
  if (key !== input.after.streamId) throw new Error("Foreign reader stream");
  const existing = registry.entries.get(key);
  if (existing?.controller.signal.aborted) await existing.task;
  input.signal.throwIfAborted();
  if (registry.closed) throw new Error("Delivery readers closed");
  const entry =
    registry.entries.get(key) ?? createEntry(input, registry, dependencies);
  if (entry.after.epoch !== input.after.epoch)
    throw new Error("Reader epoch mismatch");
  const id = Symbol();
  const deferred = Promise.withResolvers<void>();
  entry.watchers.set(id, {
    onAvailable: input.onAvailable,
    revision: "",
    finish: (error) =>
      error === undefined ? deferred.resolve() : deferred.reject(error),
  });
  /** Последний subscriber отменяет BLOCK и ждёт task; остальные освобождают только свою подписку. */
  const cancel = () => {
    entry.watchers.delete(id);
    if (entry.watchers.size) {
      deferred.resolve();
      return;
    }
    entry.controller.abort();
    entry.task.then(() => deferred.resolve(), deferred.reject);
  };
  input.signal.addEventListener("abort", cancel, { once: true });
  if (input.signal.aborted) cancel();
  try {
    await deferred.promise;
  } finally {
    input.signal.removeEventListener("abort", cancel);
    entry.watchers.delete(id);
    if (!entry.watchers.size) {
      entry.controller.abort();
      await entry.task;
    }
  }
};
