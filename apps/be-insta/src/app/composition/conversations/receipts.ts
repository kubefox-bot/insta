import type { RedisClient } from "bun";
import { receiptPolicy } from "../../../domains/conversations/index";
import {
  createCommitReceipts,
  createMongoReceiptOutbox,
} from "../../../domains/conversations/server/index";
import type { connectDatabase } from "../../../lib/database/index";
import { createActorQuota } from "../../../lib/dragonfly/index";
/** Связывает транзакции receipts, независимую очередь и квоту с конфигурацией composition owner. */
export const createReceiptsDependencies = ({
  database,
  broker,
  key,
  retentionMs,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  key: string;
  retentionMs: number;
}>) => ({
  receipts: {
    commitReceipts: createCommitReceipts({
      db: database.apiDb,
      startSession: database.startSession,
      clock: Date.now,
      retentionMs,
    }),
    quota: createActorQuota({
      client: broker,
      key,
      namespace: "receipts",
      maximum: receiptPolicy.requestsPerMinute,
    }),
    clock: Date.now,
  },
  receiptOutbox: createMongoReceiptOutbox({ db: database.apiDb }),
});
