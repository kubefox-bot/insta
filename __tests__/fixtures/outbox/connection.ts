import { Result } from "@bloodyowl/boxed";
import { createConnection } from "../../../apps/fe-insta/src/domains/conversations/browser/outbox/adapters/lib/indexed-db/connection";

// Native version 1 blocker has no schema; version 2 exercises the real upgrade.
export const createConnectionProbe = () => {
  let blocker: IDBDatabase | undefined;
  let connection: ReturnType<typeof createConnection> | undefined;
  const counts = { opens: 0, successes: 0, closes: 0 };
  return {
    block: (name: string) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onsuccess = () => {
          blocker = request.result;
          resolve();
        };
        request.onerror = () => reject(request.error);
      }),
    start: (name: string) => {
      const factory = Object.assign({} as IDBFactory, {
        open: () => {
          counts.opens++;
          const request = indexedDB.open(name, 2);
          request.addEventListener("success", () => {
            counts.successes++;
            const database = request.result;
            const close = database.close.bind(database);
            database.close = () => {
              counts.closes++;
              close();
            };
          });
          return request;
        },
      });
      connection = createConnection({ factory, databaseName: name });
    },
    run: async () => {
      if (!connection) throw Error("Connection probe missing");
      const result = await connection.run("readonly", (_store, complete) =>
        complete(Result.Ok("ready")),
      );
      return result.isOk() ? result.get() : result.getError();
    },
    counts: () => ({ ...counts }),
    release: () => {
      blocker?.close();
      blocker = undefined;
    },
    close: () => {
      blocker?.close();
      blocker = undefined;
      connection?.close();
    },
  };
};
