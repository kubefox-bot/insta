import type { ClientSession, Db } from "mongodb";
import type { DeliveryJournal } from "../../../../ports/delivery/interfaces";
import type { DeliveryRange } from "../../../../ports/delivery/types";
import {
  deliveryCleanupPolicy,
  deliveryCollections,
  deliveryReadOptions,
} from "../conts";
import { deliveryDocumentSchema, deliveryMetadataSchema } from "../schema";
import type { DeliveryDocument, DeliveryMetadata } from "../types";
/** Находит живой suffix до фиксированного majority head и проверяет полноту интервала после durable floor; пустота отличается от потерянных строк. */
export const readRangeSnapshot = async (
  input: Parameters<DeliveryJournal["range"]>[0] &
    Readonly<{ db: Db; session: ClientSession }>,
): Promise<DeliveryRange> => {
  const { db, session, stream, nowMs, signal } = input;
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new Error("Invalid delivery range time");
  const metadata = deliveryMetadataSchema.parse(
    await db
      .collection<DeliveryMetadata>(
        deliveryCollections.metadata,
        deliveryReadOptions,
      )
      .findOne({ _id: `${stream.kind}:${stream.id}` }, { session, signal }),
  );
  const head = {
    streamId: metadata.streamId,
    epoch: metadata.epoch,
    cursor: metadata.cursor,
  };
  if (metadata.trimmedThrough > head.cursor)
    throw new Error("Invalid delivery retention floor");
  const count = head.cursor - metadata.trimmedThrough;
  if (count === 0)
    return metadata.lastExpiresAt > nowMs
      ? { kind: "resync-required" }
      : { kind: "range", after: head, head };
  const documents = db.collection<DeliveryDocument>(
    deliveryCollections.journal,
    deliveryReadOptions,
  );
  const filter = {
    streamId: head.streamId,
    epoch: head.epoch,
    cursor: { $gt: metadata.trimmedThrough, $lte: head.cursor },
  };
  const storedCount = await documents.countDocuments(filter, {
    session,
    limit: count,
    maxTimeMS: deliveryCleanupPolicy.queryTimeoutMs,
    signal,
  });
  if (storedCount !== count) return { kind: "resync-required" };
  const first = await documents.findOne(
    { ...filter, expiresAt: { $gt: new Date(nowMs) } },
    {
      session,
      sort: { cursor: 1 },
      maxTimeMS: deliveryCleanupPolicy.queryTimeoutMs,
      signal,
    },
  );
  if (!first)
    return metadata.lastExpiresAt > nowMs
      ? { kind: "resync-required" }
      : { kind: "range", after: head, head };
  const live = deliveryDocumentSchema.parse(first);
  return { kind: "range", after: { ...head, cursor: live.cursor - 1 }, head };
};
