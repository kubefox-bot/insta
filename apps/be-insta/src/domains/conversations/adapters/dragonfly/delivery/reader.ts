import { subscribeReader } from "./reader-subscription";
import type {
  ReaderRegistry,
  StreamsDependencies,
  StreamsReader,
} from "./types";
/** Делит один reader между подписками runtime; последний cancel дожидается закрытия собственного blocking client. */
export const createReaders = (
  dependencies: StreamsDependencies,
): StreamsReader => {
  const registry: ReaderRegistry = { entries: new Map(), closed: false };
  return {
    watch: (input) => subscribeReader(input, registry, dependencies),
    close: async () => {
      registry.closed = true;
      const entries = [...registry.entries.values()];
      for (const entry of entries) entry.controller.abort();
      await Promise.all(entries.map((entry) => entry.task));
    },
  };
};
