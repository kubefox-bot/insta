import type { StoredDelivery } from "../../../ports/delivery/types";
import { deliveryDocumentSchema } from "./schema";
/** Валидирует Mongo-документ и преобразует BSON-время в переносимую ссылку, исключая приватный _id. */
export const mapStoredDelivery = (row: unknown): StoredDelivery => {
  const { _id, recordedAt, expiresAt, ...event } =
    deliveryDocumentSchema.parse(row);
  return {
    ...event,
    recordedAt: recordedAt.getTime(),
    expiresAt: expiresAt.getTime(),
  };
};
