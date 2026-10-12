import { deliverySourceCollections } from "./conts";
import type {
  AppendDeliveryInput,
  RecoveryTarget,
  RetainedSource,
} from "./types";
/** Продлевает только новую транзакционную ссылку до её собственного срока и фиксирует manifest для обнаружения потери живых строк. */
export const retainDeliverySource = async ({
  db,
  session,
  source,
  target,
}: Pick<AppendDeliveryInput, "db" | "session" | "source"> &
  Readonly<{ target: RecoveryTarget }>) => {
  const name = deliverySourceCollections[source.kind];
  const updated = await db.collection<RetainedSource>(name).updateOne(
    { _id: source.eventId },
    {
      $max: { recoveryExpiresAt: target.expiresAt },
      $push: { recoveryTargets: target },
    },
    { session },
  );
  if (updated.matchedCount !== 1)
    throw new Error("Delivery source missing inside transaction");
};
