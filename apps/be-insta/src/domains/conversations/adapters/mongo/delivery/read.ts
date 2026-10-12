import { deliveryPositionSchema } from "@insta/contracts/realtime";
import type { Db } from "mongodb";
import type { DeliveryJournal } from "../../../ports/delivery/interfaces";
import type { DeliveryPage } from "../../../ports/delivery/types";
import { deliveryCollections, deliveryReadOptions } from "./conts";
import { mapStoredDelivery } from "./map";
import { deliveryMetadataSchema } from "./schema";
import type { DeliveryDocument, DeliveryMetadata } from "./types";
/** Читает последовательную страницу до majority head; пропуск, чужой epoch и логическое истечение требуют нового snapshot независимо от TTL-монитора. */
export const readDeliveryPage = async ({
  db,
  after,
  limit,
  nowMs,
  signal,
}: Parameters<DeliveryJournal["read"]>[0] &
  Readonly<{ db: Db }>): Promise<DeliveryPage> => {
  deliveryPositionSchema.parse(after);
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  )
    throw new Error("Invalid delivery page bounds");
  const document = await db
    .collection<DeliveryMetadata>(
      deliveryCollections.metadata,
      deliveryReadOptions,
    )
    .findOne({ _id: after.streamId }, { signal });
  if (!document) return { kind: "resync-required" };
  const metadata = deliveryMetadataSchema.parse(document);
  if (metadata.epoch !== after.epoch || after.cursor > metadata.cursor)
    return { kind: "resync-required" };
  const rows = await db
    .collection<DeliveryDocument>(
      deliveryCollections.journal,
      deliveryReadOptions,
    )
    .find(
      {
        streamId: after.streamId,
        epoch: after.epoch,
        cursor: { $gt: after.cursor, $lte: metadata.cursor },
      },
      { signal },
    )
    .sort({ cursor: 1 })
    .limit(limit)
    .toArray();
  const events = rows.map(mapStoredDelivery);
  if (
    events.length !== Math.min(limit, metadata.cursor - after.cursor) ||
    events.some(
      (event, index) =>
        event.cursor !== after.cursor + index + 1 || event.expiresAt <= nowMs,
    )
  )
    return { kind: "resync-required" };
  return {
    kind: "page",
    events,
    head: {
      streamId: metadata.streamId,
      epoch: metadata.epoch,
      cursor: metadata.cursor,
    },
  };
};
