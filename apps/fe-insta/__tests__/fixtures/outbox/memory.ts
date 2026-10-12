import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import type { QueuedMessage } from "../../../src/domains/conversations/browser/outbox/domain/types";
import type { Queue } from "../../../src/domains/conversations/browser/outbox/ports/queue";
export const memoryQueue = (): Queue => {
  const records = new Map<string, QueuedMessage>();
  return {
    insert: async (record) => {
      if (
        [...records.values()].filter((item) => item.ownerId === record.ownerId)
          .length >= 100
      )
        return Result.Error("QUEUE_FULL");
      records.set(record.operationId, structuredClone(record));
      return Result.Ok(record);
    },
    list: async (ownerId) =>
      Result.Ok(
        [...records.values()]
          .filter((record) => record.ownerId === ownerId)
          .map((record) => structuredClone(record)),
      ),
    update: async (record, revision, options) => {
      if (options?.signal?.aborted)
        return Result.Error(SessionErrorCode.ActorChanged);
      const current = records.get(record.operationId);
      if (
        !current ||
        current.revision !== revision ||
        current.ownerId !== record.ownerId
      )
        return Result.Ok(false);
      records.set(record.operationId, structuredClone(record));
      return Result.Ok(true);
    },
    remove: async (record) => {
      const current = records.get(record.operationId);
      if (
        !current ||
        current.ownerId !== record.ownerId ||
        current.revision !== record.revision ||
        current.lastAuthGeneration !== record.lastAuthGeneration
      )
        return Result.Ok(false);
      return Result.Ok(records.delete(record.operationId));
    },
    clear: async (ownerId) => {
      for (const [id, record] of records)
        if (record.ownerId === ownerId) records.delete(id);
      return Result.Ok(undefined);
    },
    close: () => {},
  };
};

export const unavailableQueue = (): Queue => ({
  ...memoryQueue(),
  insert: async () => Result.Error("PERSISTENCE_FAILED"),
});
export const readRecords = async (queue: Queue, ownerId = "owner") => {
  const listed = await queue.list(ownerId);
  if (listed.isError()) throw new Error(listed.getError());
  return listed.get();
};
