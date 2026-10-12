import type { Db } from "mongodb";
import type { DeliveryJournal } from "../../../ports/delivery/interfaces";
import type { SourceDeliveries } from "../../../ports/delivery/types";
import {
  deliveryCollections,
  deliveryReadOptions,
  deliverySourceCollections,
} from "./conts";
import { mapStoredDelivery } from "./map";
import { recoverySourceSchema } from "./schema";
import type { DeliveryDocument } from "./types";
/** Восстанавливает живые ссылки конкретного source по сохранённому manifest; истёкшие адресаты пропускаются, потеря живой ссылки остаётся ошибкой. */
export const readSourceDeliveries = async ({
  db,
  source,
  nowMs,
  signal,
}: Parameters<DeliveryJournal["forSource"]>[0] &
  Readonly<{ db: Db }>): Promise<SourceDeliveries> => {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new Error("Invalid delivery source time");
  const name = deliverySourceCollections[source.kind];
  const stored = recoverySourceSchema.parse(
    await db
      .collection<{ _id: string }>(name, deliveryReadOptions)
      .findOne({ _id: source.eventId }, { signal }),
  );
  const targets = stored.recoveryTargets.filter(
    (target) => target.expiresAt.getTime() > nowMs,
  );
  const maximum = Math.max(
    ...stored.recoveryTargets.map((target) => target.expiresAt.getTime()),
  );
  if (stored.recoveryExpiresAt.getTime() !== maximum)
    throw new Error("Invalid delivery source retention");
  if (targets.length === 0) return { kind: "expired" };
  const rows = await db
    .collection<DeliveryDocument>(
      deliveryCollections.journal,
      deliveryReadOptions,
    )
    .find(
      { "source.kind": source.kind, "source.eventId": source.eventId },
      { signal },
    )
    .toArray();
  const events = targets.map((target) => {
    const row = rows.find(
      (candidate) =>
        candidate.streamId === target.streamId &&
        candidate.epoch === target.epoch &&
        candidate.cursor === target.cursor,
    );
    const event = mapStoredDelivery(row);
    if (
      event.expiresAt !== target.expiresAt.getTime() ||
      event.eventId !== source.eventId ||
      event.createdAt !== stored.createdAt
    )
      throw new Error("Invalid delivery source reference");
    return event;
  });
  return { kind: "active", events };
};
