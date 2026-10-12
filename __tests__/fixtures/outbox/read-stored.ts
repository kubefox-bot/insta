import type { Page } from "@playwright/test";
import {
  outboxDatabaseName,
  outboxStoreName,
} from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/domain/conts";

/** Читает durable очередь браузерного контекста и закрывает заимствованное тестом соединение после завершения транзакции. */
export const readStoredOutbox = (page: Page): Promise<readonly unknown[]> =>
  page.evaluate(
    ({ database, store }) =>
      new Promise<readonly unknown[]>((resolve, reject) => {
        const open = indexedDB.open(database);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          try {
            const transaction = db.transaction(store, "readonly");
            const request = transaction.objectStore(store).getAll();
            transaction.oncomplete = () => {
              db.close();
              resolve(request.result);
            };
            transaction.onabort = () => {
              db.close();
              reject(transaction.error);
            };
          } catch (error) {
            db.close();
            reject(error);
          }
        };
      }),
    { database: outboxDatabaseName, store: outboxStoreName },
  );
