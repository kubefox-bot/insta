import type { Result } from "@bloodyowl/boxed";
import type { QueuedMessage, QueueError } from "../domain/types";
export type Queue = Readonly<{
  insert: (record: QueuedMessage) => Promise<Result<QueuedMessage, QueueError>>;
  list: (
    ownerId: string,
  ) => Promise<Result<readonly QueuedMessage[], QueueError>>;
  // A signal aborted before commit rolls back the durable update with ACTOR_CHANGED.
  update: (
    record: QueuedMessage,
    expectedRevision: number,
    options?: Readonly<{ signal?: AbortSignal }>,
  ) => Promise<Result<boolean, QueueError>>;
  remove: (record: QueuedMessage) => Promise<Result<boolean, QueueError>>;
  clear: (ownerId: string) => Promise<Result<undefined, QueueError>>;
  close: () => void;
}>;
