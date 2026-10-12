import type { DeliveryStreams } from "../../../ports/delivery/interfaces";
import { appendDelivery } from "./append";
import { acquireLease, releaseLease } from "./lease";
import { inspectStream, readStream } from "./read";
import { createReaders } from "./reader";
import { createGenerationReclaimer } from "./reclaim";
import { beginRestore, publishReady } from "./retain";
import { createRetention } from "./retention";
import type { StreamsDependencies } from "./types";
/** Собирает Streams adapter на заимствованном command client; отдельными blocking clients владеет reader registry. */
export const createDragonflyDeliveryStreams = (
  dependencies: StreamsDependencies,
): DeliveryStreams => {
  const readers = createReaders(dependencies);
  const reclaim = createGenerationReclaimer(dependencies);
  return {
    retain: createRetention(dependencies),
    acquire: async (input) => {
      await reclaim(input.signal);
      return acquireLease(input, dependencies);
    },
    begin: (input) => beginRestore(input, dependencies),
    append: (input) => appendDelivery(input, dependencies),
    publishReady: (input) => publishReady(input, dependencies),
    release: (input) => releaseLease(input, dependencies),
    inspect: (input) => inspectStream(input, dependencies),
    read: (input) => readStream(input, dependencies),
    ...readers,
  };
};
