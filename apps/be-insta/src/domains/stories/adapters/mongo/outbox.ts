import type { ClientSession, Db } from "mongodb";
import { maintenancePolicy } from "../../domain/maintenance/conts";
import type { StoryOutbox } from "../../ports/maintenance/interfaces";
import { storyCollections, storyTransactionOptions } from "./conts";
import type { PublicationAcknowledgement } from "./types";
/** Owns bounded pending reads and atomic completion of publication and its notification. */
export const createStoryOutbox = ({
  db,
  startSession,
  acknowledgePublication,
}: Readonly<{
  db: Db;
  startSession: () => ClientSession;
  acknowledgePublication?: PublicationAcknowledgement;
}>): StoryOutbox => ({
  pending: async () =>
    (
      await db
        .collection<{ eventId: string; state: string }>(storyCollections.outbox)
        .find({ state: "pending" })
        .limit(maintenancePolicy.cleanupBatch)
        .toArray()
    ).map((event) => event.eventId),
  acknowledge: async (eventId) => {
    const session = startSession();
    try {
      await session.withTransaction(async () => {
        await db
          .collection<{ eventId: string; state: string }>(
            storyCollections.outbox,
          )
          .updateOne(
            { eventId, state: "pending" },
            { $set: { state: "delivered" } },
            { session },
          );
        await acknowledgePublication?.({ session, eventId });
      }, storyTransactionOptions);
    } finally {
      await session.endSession();
    }
  },
});
