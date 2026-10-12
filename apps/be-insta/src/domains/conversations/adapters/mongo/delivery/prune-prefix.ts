import type { ClientSession, Db } from "mongodb";
import { deliveryCleanupPolicy, deliveryCollections } from "./conts";
import { deliveryDocumentSchema, deliveryMetadataSchema } from "./schema";
import type { DeliveryDocument, DeliveryMetadata } from "./types";
/** Удаляет ограниченный истёкший префикс и атомарно двигает его floor; пропуск не маскируется очисткой. */
export const pruneDeliveryPrefix = async ({
  db,
  session,
  nowMs,
  signal,
}: Readonly<{
  db: Db;
  session: ClientSession;
  nowMs: number;
  signal?: AbortSignal;
}>): Promise<number> => {
  signal?.throwIfAborted();
  const documents = db.collection<DeliveryDocument>(
    deliveryCollections.journal,
  );
  const rows = await documents
    .find({ expiresAt: { $lte: new Date(nowMs) } }, { session, signal })
    .sort({ expiresAt: 1, streamId: 1, cursor: 1 })
    .limit(deliveryCleanupPolicy.batchSize)
    .toArray();
  const metadata = db.collection<DeliveryMetadata>(
    deliveryCollections.metadata,
  );
  for (const raw of rows) {
    const row = deliveryDocumentSchema.parse(raw);
    const state = deliveryMetadataSchema.parse(
      await metadata.findOne({ _id: row.streamId }, { session, signal }),
    );
    if (
      row.epoch !== state.epoch ||
      row.cursor !== state.trimmedThrough + 1 ||
      row.cursor > state.cursor
    )
      throw new Error("Delivery prefix gap cannot be pruned");
    await documents.deleteOne({ _id: row._id }, { session });
    await metadata.updateOne(
      { _id: row.streamId },
      { $set: { trimmedThrough: row.cursor } },
      { session },
    );
    signal?.throwIfAborted();
  }
  return rows.length;
};
