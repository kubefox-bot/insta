import { findOwnedConversation } from "./lib/owned-conversation";
import type { CanonicalFixtureInput, OutboxDocument } from "./types";
export const replayOwnedCanonical = async (input: CanonicalFixtureInput) => {
  if (input.request.method !== "POST")
    return new Response(null, { status: 405 });
  const conversationId = await findOwnedConversation(input);
  if (!conversationId) return new Response(null, { status: 403 });
  const documents = input.db.collection<OutboxDocument>("conversations_outbox");
  const row = await documents.findOne({
    conversationId,
    actorId: input.actorId,
  });
  if (!row) return new Response(null, { status: 404 });
  const reset = await documents.updateOne(
    {
      _id: row._id,
      conversationId,
      actorId: input.actorId,
      "deliveries.realtime.state": "delivered",
    },
    {
      $set: {
        "deliveries.realtime.state": "pending",
        "deliveries.realtime.leaseUntil": 0,
        "deliveries.realtime.nextAttemptAt": 0,
      },
      $unset: { "deliveries.realtime.leaseId": "" },
    },
  );
  return Response.json(
    { reset: reset.modifiedCount === 1, eventId: row.eventId },
    { status: reset.modifiedCount === 1 ? 200 : 409 },
  );
};
