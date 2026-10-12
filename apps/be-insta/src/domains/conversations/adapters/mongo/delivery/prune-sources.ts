import type { Db, Filter } from "mongodb";
import { collections } from "../conts";
import { receiptCollections } from "../receipts/conts";
import { deliveryCleanupPolicy, deliveryCollections } from "./conts";
import type { RetainedSource } from "./types";

/** Ограниченно удаляет завершённые истёкшие источники; повторяет sink-предикаты при delete, сохраняя независимую pending работу. */
const pruneSourceBatch = async ({
  db,
  name,
  filter,
  signal,
}: Readonly<{
  db: Db;
  name: string;
  filter: Filter<RetainedSource>;
  signal?: AbortSignal;
}>) => {
  signal?.throwIfAborted();
  const documents = db.collection<RetainedSource>(name);
  const rows = await documents
    .find(filter, { projection: { _id: 1 }, signal })
    .limit(deliveryCleanupPolicy.batchSize)
    .toArray();
  if (rows.length)
    await documents.deleteMany({
      ...filter,
      _id: { $in: rows.map((row) => row._id) },
    });
};
/** Завершение realtime, legacy analytics и обоих projection sinks обязательно независимо от истечения replay retention. */
export const pruneDeliverySources = async ({
  db,
  nowMs,
  signal,
}: Readonly<{ db: Db; nowMs: number; signal?: AbortSignal }>) => {
  await pruneSourceBatch({
    db,
    name: deliveryCollections.notifications,
    filter: {
      recoveryExpiresAt: { $lte: new Date(nowMs) },
      state: "delivered",
    },
    ...(signal ? { signal } : {}),
  });
  const recoveryExpiresAt = { $lte: new Date(nowMs) };
  await pruneSourceBatch({
    db,
    name: collections.outbox,
    ...(signal ? { signal } : {}),
    filter: {
      recoveryExpiresAt,
      "deliveries.realtime.state": { $in: ["delivered", "expired"] },
      "deliveries.analytics.state": "delivered",
      $or: [
        { projection: { $exists: false } },
        {
          "projection.deliveries.log_only.state": {
            $in: ["delivered", "denied"],
          },
          "projection.deliveries.otel.state": { $in: ["delivered", "denied"] },
        },
      ],
    },
  });
  await pruneSourceBatch({
    db,
    name: receiptCollections.outbox,
    ...(signal ? { signal } : {}),
    filter: { recoveryExpiresAt, state: { $in: ["delivered", "expired"] } },
  });
};
