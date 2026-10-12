import { createIndexedDbQueue } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/indexed-db";
import { enqueue } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/enqueue";
export const failOwnedWrite = async (databaseName: string) => {
  const queue = createIndexedDbQueue({ factory: indexedDB, databaseName });
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (this.transaction.db.name === databaseName)
      throw new DOMException("Owned quota fault", "QuotaExceededError");
    return original.call(this, value, key);
  };
  try {
    const result = await enqueue(
      {
        ownerId: "owner",
        authGeneration: "g1",
        conversationId: "a".repeat(24),
        text: "open draft",
      },
      { queue, clock: () => 0, uuid: () => crypto.randomUUID() },
    );
    return result.isOk() ? "durable" : result.getError();
  } finally {
    IDBObjectStore.prototype.add = original;
    queue.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Owned quota cleanup blocked"));
    });
  }
};
