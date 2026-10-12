import type {
  DeliveryJournal,
  DeliveryStreams,
} from "../../../src/domains/conversations/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
/** Empty canonical stream fixture: admission проверяет реальные use cases без внешней инфраструктуры. */
export const deliveryProviders = () => {
  const epoch = "7ee32a62-1281-4ac6-83e8-7f10d0112244";
  const journal: DeliveryJournal = {
    head: async ({ stream }) => ({
      streamId: `${stream.kind}:${stream.id}`,
      epoch,
      cursor: 0,
    }),
    range: async ({ stream }) => {
      const head = {
        streamId: `${stream.kind}:${stream.id}`,
        epoch,
        cursor: 0,
      };
      return { kind: "range", head, after: head };
    },
    prune: async () => ({ removed: 0 }),
    forSource: async () => ({ kind: "expired" }),
    read: async ({ after }) => ({ kind: "page", head: after, events: [] }),
    materialize: async () => {
      throw new Error("Empty fixture stream");
    },
  };
  const streams: DeliveryStreams = {
    retain: async () => {},
    acquire: async ({ stream }) => ({
      stream,
      token: "lease",
      generation: "generation",
    }),
    begin: async ({ after }) => after,
    append: async () => "appended",
    publishReady: async () => {},
    release: async () => {},
    inspect: async ({ after }) => ({
      kind: "ready",
      after,
      head: after,
      generation: "generation",
    }),
    read: async ({ after }) => ({ kind: "page", head: after, events: [] }),
    watch: async ({ signal }) => {
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
    },
    close: async () => {},
  };
  return { journal, streams, policy: readRealtimeConfig({}) };
};
