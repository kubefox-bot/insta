import type { Page } from "@playwright/test";
import { z } from "zod";
export const ageOwnedQueue = async ({
  page,
  ownerId,
}: Readonly<{ page: Page; ownerId: string }>) => {
  const keys = await page.evaluate(async (ownerId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("insta-conversations-outbox");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const transaction = database.transaction("operations", "readwrite");
        const store = transaction.objectStore("operations");
        const request = store.getAll();
        const keys: string[] = [];
        request.onsuccess = () => {
          const rows: unknown[] = request.result;
          for (const value of rows) {
            if (
              typeof value !== "object" ||
              value === null ||
              !("ownerId" in value) ||
              value.ownerId !== ownerId ||
              !("key" in value) ||
              typeof value.key !== "string" ||
              !("revision" in value) ||
              typeof value.revision !== "number"
            ) {
              transaction.abort();
              return;
            }
            keys.push(value.key);
            store.put({ ...value, createdAt: 0, revision: value.revision + 1 });
          }
        };
        transaction.oncomplete = () => resolve(keys);
        transaction.onabort = () =>
          reject(new Error("Owned queue ageing aborted"));
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, ownerId);
  return z.array(z.string()).parse(keys);
};
