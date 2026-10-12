import type { DeliveryPosition } from "@insta/contracts/realtime";
import { deliveryCollections } from "./conts";
import { deliveryMetadataSchema } from "./schema";
import type { AppendDeliveryInput, DeliveryMetadata } from "./types";
/** Сериализует выделение позиции и монотонного срока в транзакции; ошибка валидации откатывает счётчик вместе с бизнес-записью. */
export const allocateDeliveryPosition = async ({
  db,
  session,
  streamId,
  serverNowMs,
  retentionMs,
}: Pick<AppendDeliveryInput, "db" | "session" | "serverNowMs" | "retentionMs"> &
  Readonly<{ streamId: string }>): Promise<
  DeliveryPosition & { recordedAt: Date; expiresAt: Date }
> => {
  const metadata = db.collection<DeliveryMetadata>(
    deliveryCollections.metadata,
  );
  const updated = await metadata.findOneAndUpdate(
    { _id: streamId },
    {
      $setOnInsert: {
        streamId,
        epoch: crypto.randomUUID(),
        lastExpiresAt: 0,
        trimmedThrough: 0,
      },
      $inc: { cursor: 1 },
      $max: { lastRecordedAt: serverNowMs },
    },
    { session, upsert: true, returnDocument: "after" },
  );
  const position = deliveryMetadataSchema.parse(updated);
  const expiresAt = Math.max(
    position.lastRecordedAt + retentionMs,
    position.lastExpiresAt,
  );
  if (
    !Number.isSafeInteger(expiresAt) ||
    !Number.isFinite(new Date(expiresAt).getTime())
  )
    throw new Error("Delivery retention exhausted");
  await metadata.updateOne(
    { _id: streamId },
    { $set: { lastExpiresAt: expiresAt } },
    { session },
  );
  return {
    streamId,
    epoch: position.epoch,
    cursor: position.cursor,
    recordedAt: new Date(position.lastRecordedAt),
    expiresAt: new Date(expiresAt),
  };
};
