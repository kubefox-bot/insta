import { outboxDatabaseName } from "../domain/conts";
import type { Queue } from "../ports/queue";
import { createClear } from "./lib/indexed-db/clear";
import { createConnection } from "./lib/indexed-db/connection";
import { createInsert } from "./lib/indexed-db/insert";
import { createList } from "./lib/indexed-db/list";
import { createRemove } from "./lib/indexed-db/remove";
import { createUpdate } from "./lib/indexed-db/update";
/** Собирает операции очереди вокруг одного ленивого IDB-соединения; close освобождает соединение, не удаляя базу. */
export const createIndexedDbQueue = ({
  factory,
  databaseName = outboxDatabaseName,
}: Readonly<{ factory: IDBFactory; databaseName?: string }>): Queue => {
  const { run, close } = createConnection({ factory, databaseName });
  return {
    insert: createInsert(run),
    list: createList(run),
    update: createUpdate(run),
    remove: createRemove(run),
    clear: createClear(run),
    close,
  };
};
