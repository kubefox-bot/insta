import { allocateDeliveryPosition } from "./allocate";
import { deliveryCollections } from "./conts";
import { retainDeliverySource } from "./retain-source";
import type { AppendDeliveryInput, DeliveryDocument } from "./types";
/** Сохраняет ссылки и retention исходного outbox в заимствованной бизнес-транзакции; единый порядок потоков снижает взаимные конфликты. */
export const appendDeliveryWithinTransaction = async ({
  db,
  session,
  source,
  targets,
  createdAt,
  serverNowMs,
  retentionMs,
}: AppendDeliveryInput): Promise<void> => {
  const ordered = targets
    .map((target) => ({
      ...target,
      streamId: `${target.stream.kind}:${target.stream.id}`,
    }))
    .sort((a, b) => a.streamId.localeCompare(b.streamId));
  for (const target of ordered) {
    const position = await allocateDeliveryPosition({
      db,
      session,
      streamId: target.streamId,
      serverNowMs,
      retentionMs,
    });
    await db
      .collection<Omit<DeliveryDocument, "_id">>(deliveryCollections.journal)
      .insertOne(
        {
          ...position,
          eventId: source.eventId,
          eventType: target.eventType,
          source,
          createdAt,
        },
        { session },
      );
    const { recordedAt, ...reference } = position;
    await retainDeliverySource({ db, session, source, target: reference });
  }
};
