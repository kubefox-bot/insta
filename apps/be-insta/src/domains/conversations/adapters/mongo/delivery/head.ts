import type { DeliveryPosition } from "@insta/contracts/realtime";
import { type Db, MongoServerError } from "mongodb";
import type { DeliveryJournal } from "../../../ports/delivery/interfaces";
import { duplicateKeyCode } from "../conts";
import { deliveryCollections, deliveryReadOptions } from "./conts";
import { deliveryMetadataSchema } from "./schema";
import type { DeliveryMetadata } from "./types";
/** Читает только majority-visible head; отсутствующий поток получает постоянный epoch без перезаписи конкурирующей первой транзакции. */
export const readDeliveryHead = async ({
  db,
  stream,
  signal,
}: Parameters<DeliveryJournal["head"]>[0] &
  Readonly<{ db: Db }>): Promise<DeliveryPosition> => {
  signal?.throwIfAborted();
  const streamId = `${stream.kind}:${stream.id}`;
  const metadata = db.collection<DeliveryMetadata>(
    deliveryCollections.metadata,
    deliveryReadOptions,
  );
  const existing = await metadata.findOne({ _id: streamId }, { signal });
  if (existing) {
    const value = deliveryMetadataSchema.parse(existing);
    return {
      streamId: value.streamId,
      epoch: value.epoch,
      cursor: value.cursor,
    };
  }
  const initial: DeliveryMetadata = {
    _id: streamId,
    streamId,
    epoch: crypto.randomUUID(),
    cursor: 0,
    trimmedThrough: 0,
    lastRecordedAt: 0,
    lastExpiresAt: 0,
  };
  try {
    await metadata.insertOne(initial, { writeConcern: { w: "majority" } });
    signal?.throwIfAborted();
    return { streamId, epoch: initial.epoch, cursor: 0 };
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === duplicateKeyCode))
      throw error;
    const value = deliveryMetadataSchema.parse(
      await metadata.findOne({ _id: streamId }, { signal }),
    );
    return {
      streamId: value.streamId,
      epoch: value.epoch,
      cursor: value.cursor,
    };
  }
};
