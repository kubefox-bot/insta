import type { Collection, Filter } from "mongodb";
import type { OutboxClaim } from "../../../ports/outbox";
import type { OutboxDocument } from "../types";
/** Завершает только истёкшее realtime recovery собственной живой аренды, без browser ACK и analytics effects. */
export const expireOutbox = async ({
  documents,
  input,
  owned,
}: Readonly<{
  documents: Collection<OutboxDocument>;
  input: OutboxClaim & Readonly<{ now: number }>;
  owned: Filter<OutboxDocument>;
}>) => {
  if (input.sink !== "realtime")
    throw new Error("Only realtime recovery may expire");
  return (
    (
      await documents.updateOne(
        { ...owned, "deliveries.realtime.leaseUntil": { $gt: input.now } },
        {
          $set: {
            "deliveries.realtime.state": "expired",
            "deliveries.realtime.recoveryExpiredAt": input.now,
            "deliveries.realtime.leaseUntil": 0,
          },
          $unset: { "deliveries.realtime.leaseId": "" },
        },
      )
    ).modifiedCount === 1
  );
};
